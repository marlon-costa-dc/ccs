/**
 * Auto-Sync Watcher
 *
 * Watches for profile settings changes and automatically syncs to local CLIProxy config.
 * Uses debouncing to prevent sync storms during rapid edits.
 */

import * as chokidar from 'chokidar';
import * as path from 'path';

import { syncToLocalConfig } from './local-config-sync';
import { regenerateConfig } from '../config/config-generator';
import { getCcsDir, loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import { ConfigError } from '../../errors/error-types';

/** Debounce delay in milliseconds */
const DEBOUNCE_MS = 3000;

/** Singleton watcher instance */
let watcherInstance: chokidar.FSWatcher | null = null;
let syncTimeout: NodeJS.Timeout | null = null;
let isSyncing = false;

/**
 * Check if auto-sync is enabled in config.
 */
export function isAutoSyncEnabled(): boolean {
  const config = loadOrCreateUnifiedConfig();
  return config.cliproxy?.auto_sync === true;
}

/**
 * Log auto-sync message.
 */
function log(message: string): void {
  console.log(`[auto-sync] ${message}`);
}

function resolveConfiguredLocalPort(): number {
  const port = loadOrCreateUnifiedConfig().cliproxy_server?.local?.port;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError('cliproxy_server.local.port must be a whole number between 1 and 65535');
  }
  return port;
}

/**
 * Execute sync to local CLIProxy config.
 */
async function triggerSync(): Promise<void> {
  if (isSyncing) {
    throw new ConfigError('Auto-sync received overlapping work while a sync is active');
  }

  if (!isAutoSyncEnabled()) {
    log('Auto-sync disabled, skipping');
    return;
  }

  isSyncing = true;

  try {
    const result = syncToLocalConfig();

    if (!result.success) {
      throw new ConfigError(`Auto-sync failed: ${result.error}`);
    }

    if (result.syncedCount === 0) {
      log('No profiles to sync');
      return;
    }

    log(`Success: ${result.syncedCount} profile(s) synced to ${result.configPath}`);
  } finally {
    isSyncing = false;
  }
}

async function triggerRegeneration(): Promise<void> {
  if (isSyncing) {
    throw new ConfigError('Auto-sync received overlapping regeneration work');
  }
  if (!isAutoSyncEnabled()) {
    log('Auto-sync disabled, skipping');
    return;
  }
  isSyncing = true;
  try {
    const configPath = regenerateConfig(resolveConfiguredLocalPort());
    log(`Success: regenerated ${configPath}`);
  } finally {
    isSyncing = false;
  }
}

function terminateOnBackgroundFailure(error: unknown): void {
  const cause = error instanceof Error ? error : new Error(String(error));
  setImmediate(() => {
    throw cause;
  });
}

/**
 * Handle file change event with debouncing.
 */
function onFileChange(filePath: string): void {
  const fileName = path.basename(filePath);
  log(`Profile change detected: ${fileName}`);

  // Clear existing timeout
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  log(`Waiting ${DEBOUNCE_MS / 1000}s for additional changes...`);

  // Set new debounced timeout
  syncTimeout = setTimeout(() => {
    syncTimeout = null;
    const operation = fileName === 'config.yaml' ? triggerRegeneration() : triggerSync();
    operation.catch(terminateOnBackgroundFailure);
  }, DEBOUNCE_MS);
}

/**
 * Start the auto-sync watcher.
 * Watches the unified SSOT and profile settings for changes.
 */
export function startAutoSyncWatcher(): void {
  if (watcherInstance) {
    log('Watcher already running');
    return;
  }

  if (!isAutoSyncEnabled()) {
    // Don't start if disabled, but log nothing (called at startup)
    return;
  }

  const ccsDir = getCcsDir();
  const watchPatterns = [path.join(ccsDir, 'config.yaml'), path.join(ccsDir, '*.settings.json')];

  log(`Starting watcher on ${watchPatterns.join(', ')}`);

  watcherInstance = chokidar.watch(watchPatterns, {
    ignoreInitial: true, // Don't trigger on initial scan
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcherInstance.on('change', onFileChange);
  watcherInstance.on('add', onFileChange);
  watcherInstance.on('unlink', onFileChange);

  watcherInstance.on('error', (error) => {
    terminateOnBackgroundFailure(error);
  });

  log('Watcher started');
}

/**
 * Stop the auto-sync watcher.
 */
export async function stopAutoSyncWatcher(): Promise<void> {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  if (watcherInstance) {
    const closePromise = watcherInstance.close();
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new ConfigError('Auto-sync watcher close timed out')), 5000)
    );
    await Promise.race([closePromise, timeoutPromise]);
    watcherInstance = null;
    log('Watcher stopped');
  }

  // Reset flag to prevent stale state
  isSyncing = false;
}

/**
 * Restart the watcher (after config change).
 */
export async function restartAutoSyncWatcher(): Promise<void> {
  // Wait for any active sync to complete (max 10s)
  const maxWait = 10000;
  const start = Date.now();
  while (isSyncing && Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (isSyncing) {
    throw new ConfigError('Auto-sync remained active after the 10 second restart deadline');
  }

  await stopAutoSyncWatcher();
  startAutoSyncWatcher();
}

/**
 * Get watcher status.
 */
export function getAutoSyncStatus(): {
  enabled: boolean;
  watching: boolean;
  syncing: boolean;
} {
  return {
    enabled: isAutoSyncEnabled(),
    watching: watcherInstance !== null,
    syncing: isSyncing,
  };
}

/**
 * Reset watcher state for test cleanup.
 * Stops watcher and clears all singleton state.
 */
export async function resetWatcherState(): Promise<void> {
  await stopAutoSyncWatcher();
  watcherInstance = null;
  syncTimeout = null;
  isSyncing = false;
}
