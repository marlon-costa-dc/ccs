/**
 * Copilot Auth Handler
 *
 * Handles GitHub OAuth authentication for copilot-api.
 * Uses local installation from ~/.ccs/copilot/ (managed by copilot-package-manager).
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CopilotAuthStatus, CopilotDebugInfo } from './types';
import {
  isCopilotApiInstalled as checkInstalled,
  getCopilotApiBinPath,
} from './copilot-package-manager';
import { createLogger } from '../services/logging';

const logger = createLogger('copilot:auth');

/**
 * Get the path to copilot-api's GitHub token file.
 * copilot-api stores tokens in ~/.local/share/copilot-api/github_token (Linux/macOS)
 * or %APPDATA%/copilot-api/github_token (Windows)
 */
export function getTokenPath(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'copilot-api', 'github_token');
  }
  return path.join(os.homedir(), '.local', 'share', 'copilot-api', 'github_token');
}

/**
 * Check if GitHub token file exists.
 * Fast check that doesn't require spawning copilot-api process.
 */
export function hasTokenFile(): boolean {
  try {
    return fs.existsSync(getTokenPath());
  } catch {
    return false;
  }
}

/**
 * Check if copilot-api is installed locally.
 * Uses copilot-package-manager to check ~/.ccs/copilot/node_modules/.bin/copilot-api
 */
export function isCopilotApiInstalled(): boolean {
  return checkInstalled();
}

/**
 * Get copilot-api debug info.
 * Returns authentication status and version info.
 */
export async function getCopilotDebugInfo(): Promise<CopilotDebugInfo | null> {
  const binPath = getCopilotApiBinPath();

  return new Promise((resolve) => {
    try {
      const proc = spawn(binPath, ['debug', '--json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        timeout: 15000,
      });

      let stdout = '';
      let _stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        _stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          try {
            const info = JSON.parse(stdout.trim()) as CopilotDebugInfo;
            resolve(info);
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 15000);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Check copilot authentication status.
 * Uses fast token file check first, falls back to copilot-api debug if needed.
 */
export async function checkAuthStatus(): Promise<CopilotAuthStatus> {
  // Fast path: check if token file exists (instant, no subprocess)
  if (hasTokenFile()) {
    logger.stage('auth', 'copilot.auth.token_present', 'Copilot token file present', {
      provider: 'copilot',
      method: 'token_file',
    });
    return { authenticated: true };
  }

  // Slow path: try copilot-api debug --json (may timeout)
  // Only used if token file doesn't exist
  const debugInfo = await getCopilotDebugInfo();

  if (debugInfo?.authenticated) {
    logger.stage('auth', 'copilot.auth.debug_ok', 'Copilot reports authenticated via debug', {
      provider: 'copilot',
      method: 'debug',
    });
    return { authenticated: true };
  }

  logger.stage(
    'auth',
    'copilot.auth.unauthenticated',
    'Copilot is not authenticated',
    { provider: 'copilot' },
    { level: 'warn' }
  );
  return {
    authenticated: false,
  };
}

/**
 * Auth flow result with optional device code info.
 */
export interface AuthFlowResult {
  success: boolean;
  error?: string;
  /** Device code for user to enter at GitHub */
  deviceCode?: string;
  /** URL where user enters the device code */
  verificationUrl?: string;
}

/**
 * Start GitHub OAuth authentication flow.
 * Captures device code from copilot-api output and returns it.
 *
 * @returns Promise that resolves with auth result including device code
 */
export function startAuthFlow(): Promise<AuthFlowResult> {
  const binPath = getCopilotApiBinPath();

  return new Promise((resolve) => {
    console.log('[i] Starting GitHub authentication for Copilot...');
    console.log('');

    const startedAt = Date.now();
    logger.stage('auth', 'copilot.auth.start', 'Starting Copilot OAuth device flow', {
      provider: 'copilot',
    });

    const proc = spawn(binPath, ['auth'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let deviceCode: string | undefined;
    let verificationUrl: string | undefined;

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;

      // Echo to console for terminal users
      process.stdout.write(chunk);

      // Parse device code from output like:
      // "Please enter the code "5653-38A1" in https://github.com/login/device"
      const codeMatch = stdout.match(/code\s+"([A-Z0-9]{4}-[A-Z0-9]{4})"/i);
      const urlMatch = stdout.match(/(https:\/\/github\.com\/login\/device)/i);

      if (codeMatch && !deviceCode) {
        deviceCode = codeMatch[1];
      }
      if (urlMatch && !verificationUrl) {
        verificationUrl = urlMatch[1];
      }
    });

    proc.stderr.on('data', (data) => {
      // Echo stderr to console
      process.stderr.write(data.toString());
    });

    proc.on('close', (code) => {
      if (code === 0) {
        logger.stage(
          'auth',
          'copilot.auth.complete',
          'Copilot OAuth device flow completed',
          { provider: 'copilot', exitCode: code },
          { latencyMs: Date.now() - startedAt }
        );
        resolve({ success: true, deviceCode, verificationUrl });
      } else {
        logger.stage(
          'cleanup',
          'copilot.auth.failed',
          'Copilot OAuth device flow failed',
          { provider: 'copilot', exitCode: code },
          { level: 'error', latencyMs: Date.now() - startedAt }
        );
        resolve({
          success: false,
          error: `Authentication failed with exit code ${code}`,
          deviceCode,
          verificationUrl,
        });
      }
    });

    proc.on('error', (err) => {
      logger.stage(
        'cleanup',
        'copilot.auth.error',
        'Failed to start Copilot OAuth process',
        { provider: 'copilot' },
        {
          level: 'error',
          latencyMs: Date.now() - startedAt,
          error: { name: err.name, message: err.message },
        }
      );
      resolve({
        success: false,
        error: `Failed to start auth: ${err.message}`,
      });
    });
  });
}
