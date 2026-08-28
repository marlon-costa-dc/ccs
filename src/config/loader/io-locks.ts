/**
 * io-locks.ts
 *
 * Path constants, lockfile management, and config I/O helpers extracted from
 * unified-config-loader.ts (Phase 1 split — issue #1164).
 *
 * Forward-reference note: loadUnifiedConfigWithLockHeld and
 * writeUnifiedConfigWithLockHeld depend on mergeWithDefaults,
 * validateCompositeVariants, generateYamlHeader, and generateYamlWithComments
 * which still live in unified-config-loader.ts (extracted in later phases).
 * Those are passed as callbacks to avoid a circular import. Once Phases 2–3
 * land in separate modules with no dependency on this file, they can be
 * imported directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import { getCcsDir } from '../../utils/config-manager';
import {
  isUnifiedConfig,
  createEmptyUnifiedConfig,
  UNIFIED_CONFIG_VERSION,
} from '../unified-config-types';
import type { UnifiedConfig } from '../unified-config-types';
import { ConfigError } from '../../errors/error-types';

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

export const CONFIG_YAML = 'config.yaml';
export const CONFIG_JSON = 'config.json';
export const CONFIG_LOCK = 'config.yaml.lock';
/** Lock is stale after this many milliseconds */
export const LOCK_STALE_MS = 5000;
export const GO_DURATION_SEGMENT = String.raw`(?:\d+(?:\.\d+)?(?:ns|us|µs|μs|ms|s|m|h))`;
export const GO_DURATION_PATTERN = new RegExp(`^${GO_DURATION_SEGMENT}+$`);

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Get path to unified config.yaml
 */
export function getConfigYamlPath(): string {
  return path.join(getCcsDir(), CONFIG_YAML);
}

/**
 * Get path to legacy config.json
 */
export function getConfigJsonPath(): string {
  return path.join(getCcsDir(), CONFIG_JSON);
}

/**
 * Get path to config lockfile (internal)
 */
function getLockFilePath(): string {
  return path.join(getCcsDir(), CONFIG_LOCK);
}

// ---------------------------------------------------------------------------
// Process check
// ---------------------------------------------------------------------------

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw new ConfigError(`failed to inspect config lock owner process ${pid}`, undefined, error);
  }
}

// ---------------------------------------------------------------------------
// Lockfile primitives
// ---------------------------------------------------------------------------

/**
 * Acquire lockfile for config write operations.
 * Returns a lock token if acquired, null if already locked by another process.
 * Cleans up stale locks (older than LOCK_STALE_MS).
 */
export function acquireLock(): string | null {
  const lockPath = getLockFilePath();
  const lockDir = path.dirname(lockPath);
  const lockToken = crypto.randomUUID();
  const lockData = `${process.pid}\n${Date.now()}\n${lockToken}`;

  try {
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true, mode: 0o700 });
    }

    // Check if lock exists
    if (fs.existsSync(lockPath)) {
      const content = fs.readFileSync(lockPath, 'utf8');
      const [pidStr, timestampStr] = content.trim().split('\n');
      const pid = Number.parseInt(pidStr, 10);
      const timestamp = Number.parseInt(timestampStr, 10);
      const hasLiveOwner = Number.isInteger(pid) && pid > 0 && processExists(pid);
      const isStale = !Number.isFinite(timestamp) || Date.now() - timestamp > LOCK_STALE_MS;

      if (hasLiveOwner) {
        return null;
      }

      if (isStale || !hasLiveOwner) {
        fs.unlinkSync(lockPath);
      }
    }

    // Acquire lock
    fs.writeFileSync(lockPath, lockData, { flag: 'wx', mode: 0o600 });
    return lockToken;
  } catch (error) {
    // EEXIST means another process acquired the lock between our check and write
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return null;
    }
    throw new ConfigError('failed to acquire CCS config write lock', lockPath, error);
  }
}

/**
 * Release lockfile after config write operation.
 */
export function releaseLock(lockToken: string): void {
  const lockPath = getLockFilePath();
  if (!fs.existsSync(lockPath)) {
    throw new ConfigError('CCS config write lock disappeared before release', lockPath);
  }
  const content = fs.readFileSync(lockPath, 'utf8');
  const fileToken = content.trim().split('\n')[2];
  if (fileToken !== lockToken) {
    throw new ConfigError('CCS config write lock ownership changed before release', lockPath);
  }
  fs.unlinkSync(lockPath);
}

// ---------------------------------------------------------------------------
// Config format detection
// ---------------------------------------------------------------------------

/**
 * Check if unified config.yaml exists
 */
export function hasUnifiedConfig(): boolean {
  return fs.existsSync(getConfigYamlPath());
}

/**
 * Check if legacy config.json exists
 */
export function hasLegacyConfig(): boolean {
  return fs.existsSync(getConfigJsonPath());
}

// ---------------------------------------------------------------------------
// Sync sleep
// ---------------------------------------------------------------------------

/**
 * Sync sleep helper for lock retry loops.
 * Uses Atomics.wait when available to avoid CPU-intensive busy-wait.
 */
export function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* busy-wait */
    }
  }
}

// ---------------------------------------------------------------------------
// Lock-aware execution wrapper
// ---------------------------------------------------------------------------

/**
 * Execute a callback while holding the config lock.
 */
export function withConfigWriteLock<T>(callback: () => T): T {
  // Acquire lock (retry for up to 1 second)
  const maxRetries = 10;
  const retryDelayMs = 100;
  let lockToken: string | null = null;
  for (let i = 0; i < maxRetries; i++) {
    const acquiredToken = acquireLock();
    if (acquiredToken) {
      lockToken = acquiredToken;
      break;
    }
    sleepSync(retryDelayMs);
  }

  if (!lockToken) {
    throw new ConfigError('Config file is locked by another process. Wait a moment and try again.');
  }

  let result: T | undefined;
  let operationError: unknown;
  try {
    result = callback();
  } catch (error) {
    operationError = error;
  }
  try {
    releaseLock(lockToken);
  } catch (releaseError) {
    throw new ConfigError(
      operationError
        ? 'config mutation and config lock release both failed'
        : 'config lock release failed',
      getLockFilePath(),
      operationError ? { operationError, releaseError } : releaseError
    );
  }
  if (operationError) throw operationError;
  return result as T;
}

// ---------------------------------------------------------------------------
// Lock-held read/write helpers
// ---------------------------------------------------------------------------

/**
 * Load unified config directly from disk while lock is already held.
 * Falls back to empty config when file doesn't exist.
 *
 * Forward-reference: mergeWithDefaults and validateCompositeVariants are
 * passed as callbacks to avoid a circular dependency. They will be imported
 * directly once all phases are complete.
 */
export function loadUnifiedConfigWithLockHeld(
  mergeWithDefaults: (partial: Partial<UnifiedConfig>) => UnifiedConfig,
  validateCompositeVariants: (config: UnifiedConfig) => void
): UnifiedConfig {
  const yamlPath = getConfigYamlPath();
  if (!fs.existsSync(yamlPath)) {
    return createEmptyUnifiedConfig();
  }

  const content = fs.readFileSync(yamlPath, 'utf8');
  const parsed = yaml.load(content);

  if (!isUnifiedConfig(parsed)) {
    throw new ConfigError(`Invalid config format in ${yamlPath}`, yamlPath);
  }

  const merged = mergeWithDefaults(parsed);
  validateCompositeVariants(merged);
  return merged;
}

/**
 * Write unified config to disk while lock is already held.
 * Uses atomic write (temp file + rename) to prevent corruption.
 *
 * Forward-reference: generateYamlHeader and generateYamlWithComments are
 * passed as callbacks to avoid a circular dependency. They will be imported
 * directly once all phases are complete.
 */
export function writeUnifiedConfigWithLockHeld(
  config: UnifiedConfig,
  generateYamlHeader: () => string,
  generateYamlWithComments: (config: UnifiedConfig) => string
): void {
  const yamlPath = getConfigYamlPath();
  const dir = path.dirname(yamlPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Ensure version is set
  config.version = UNIFIED_CONFIG_VERSION;

  // Generate YAML with section comments
  const yamlContent = generateYamlWithComments(config);
  const content = generateYamlHeader() + yamlContent;

  const tempPath = `${yamlPath}.${process.pid}.candidate`;
  let descriptor: number | undefined;

  try {
    descriptor = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(tempPath, yamlPath);
    const directoryDescriptor = fs.openSync(dir, 'r');
    let directorySyncError: unknown;
    try {
      fs.fsyncSync(directoryDescriptor);
    } catch (error) {
      directorySyncError = error;
    }
    try {
      fs.closeSync(directoryDescriptor);
    } catch (directoryCloseError) {
      throw new ConfigError(
        directorySyncError
          ? 'config directory fsync and descriptor close both failed'
          : 'config directory descriptor close failed',
        dir,
        directorySyncError ? { directorySyncError, directoryCloseError } : directoryCloseError
      );
    }
    if (directorySyncError) {
      throw new ConfigError('config directory fsync failed', dir, directorySyncError);
    }
  } catch (error) {
    let closeError: unknown;
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch (failure) {
        closeError = failure;
      }
    }
    let cleanupError: unknown;
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (cleanupFailure) {
      cleanupError = cleanupFailure;
    }
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOSPC') {
      throw new ConfigError(
        'Disk full - cannot save config. Free up space and try again.',
        yamlPath,
        closeError || cleanupError ? { error, closeError, cleanupError } : error
      );
    }
    if (err.code === 'EROFS' || err.code === 'EACCES') {
      throw new ConfigError(
        `Cannot write config - check file permissions: ${err.message}`,
        yamlPath,
        closeError || cleanupError ? { error, closeError, cleanupError } : error
      );
    }
    throw new ConfigError(
      closeError || cleanupError
        ? 'failed to persist config with additional close or candidate cleanup failure'
        : 'failed to persist config',
      yamlPath,
      closeError || cleanupError ? { error, closeError, cleanupError } : error
    );
  }
}
