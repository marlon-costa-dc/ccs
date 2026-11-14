/**
 * Copilot Daemon Manager
 *
 * Manages the copilot-api daemon lifecycle (start/stop/status).
 * Uses local installation from ~/.ccs/copilot/ (managed by copilot-package-manager).
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { CopilotDaemonStatus } from './types';
import { CopilotConfig, DEFAULT_COPILOT_CONFIG } from '../config/unified-config-types';

import { getCopilotDir, getCopilotApiBinPath } from './copilot-package-manager';
import { verifyProcessOwnership } from '../cursor/daemon-process-ownership';
import { createLogger } from '../services/logging';
import { loadOrCreateUnifiedConfig } from '../config/config-loader-facade';

const logger = createLogger('copilot:daemon');

const DAEMON_HEALTH_MARKER = 'server running';
const MIN_PORT = 1;
const MAX_PORT = 65535;

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
}

function getConfiguredCopilotPort(): number {
  try {
    const config = loadOrCreateUnifiedConfig();
    const port = config.copilot?.port ?? DEFAULT_COPILOT_CONFIG.port;
    return isValidPort(port) ? port : DEFAULT_COPILOT_CONFIG.port;
  } catch {
    return DEFAULT_COPILOT_CONFIG.port;
  }
}

function getPidFilePath(): string {
  return path.join(getCopilotDir(), 'daemon.pid');
}

/**
 * Check if copilot-api daemon is running on the specified port.
 * Uses 127.0.0.1 instead of localhost for more reliable local connections.
 */
export async function isDaemonRunning(port: number): Promise<boolean> {
  if (!isValidPort(port)) {
    return false;
  }

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/',
        method: 'GET',
        timeout: 3000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }

          resolve(body.trim().toLowerCase().includes(DAEMON_HEALTH_MARKER));
        });
      }
    );

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Get daemon status.
 */
export async function getDaemonStatus(port: number): Promise<CopilotDaemonStatus> {
  const running = await isDaemonRunning(port);
  const pid = getPidFromFile();

  return {
    running,
    port,
    pid: running ? (pid ?? undefined) : undefined,
  };
}

/**
 * Read PID from file.
 */
function getPidFromFile(): number | null {
  const pidFile = getPidFilePath();
  try {
    if (fs.existsSync(pidFile)) {
      const content = fs.readFileSync(pidFile, 'utf8').trim();
      const pid = parseInt(content, 10);
      return isNaN(pid) ? null : pid;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Write PID to file.
 */
function writePidToFile(pid: number): void {
  const pidFile = getPidFilePath();
  try {
    const dir = path.dirname(pidFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(pidFile, pid.toString(), { mode: 0o600 });
  } catch {
    // Ignore errors
  }
}

/**
 * Remove PID file.
 */
function removePidFile(): void {
  const pidFile = getPidFilePath();
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Start the copilot-api daemon.
 *
 * @param config Copilot configuration
 * @returns Promise that resolves when daemon is ready
 */
export async function startDaemon(
  config: CopilotConfig
): Promise<{ success: boolean; pid?: number; error?: string }> {
  if (!isValidPort(config.port)) {
    return {
      success: false,
      error: `Invalid Copilot daemon port ${config.port}. Expected integer between ${MIN_PORT} and ${MAX_PORT}.`,
    };
  }

  // Check if already running
  if (await isDaemonRunning(config.port)) {
    logger.stage('dispatch', 'copilot.daemon.already_running', 'Copilot daemon already running', {
      provider: 'copilot',
      port: config.port,
    });
    return { success: true, pid: getPidFromFile() ?? undefined };
  }

  const binPath = getCopilotApiBinPath();
  const args = ['start', '--port', config.port.toString()];

  // Add account type
  if (config.account_type !== 'individual') {
    args.push('--account-type', config.account_type);
  }

  // Add rate limiting
  if (config.rate_limit !== null && config.rate_limit > 0) {
    args.push('--rate-limit', config.rate_limit.toString());
    if (config.wait_on_limit) {
      args.push('--wait');
    }
  }

  const startedAt = Date.now();
  logger.stage('dispatch', 'copilot.daemon.spawn', 'Spawning Copilot daemon', {
    provider: 'copilot',
    port: config.port,
    accountType: config.account_type,
  });

  return new Promise((resolve) => {
    let proc: ChildProcess;
    let resolved = false;
    let checkTimeout: NodeJS.Timeout | null = null;

    const safeResolve = (result: { success: boolean; pid?: number; error?: string }) => {
      if (resolved) return;
      resolved = true;
      if (checkTimeout) {
        clearTimeout(checkTimeout);
      }
      if (!result.success) {
        removePidFile();
        logger.stage(
          'cleanup',
          'copilot.daemon.start_failed',
          'Copilot daemon failed to start',
          { provider: 'copilot', port: config.port },
          {
            level: 'error',
            latencyMs: Date.now() - startedAt,
            error: result.error
              ? { name: 'CopilotDaemonStartError', message: result.error }
              : undefined,
          }
        );
      } else {
        logger.stage(
          'upstream',
          'copilot.daemon.ready',
          'Copilot daemon is ready',
          { provider: 'copilot', port: config.port, pid: result.pid },
          { latencyMs: Date.now() - startedAt }
        );
      }
      resolve(result);
    };

    try {
      proc = spawn(binPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        shell: process.platform === 'win32',
      });

      // Unref so parent can exit
      proc.unref();

      if (proc.pid) {
        writePidToFile(proc.pid);
      }

      // Wait for daemon to be ready (poll for up to 30 seconds)
      let attempts = 0;
      const maxAttempts = 30;
      const pollHealth = async () => {
        if (resolved) return;
        attempts++;

        if (await isDaemonRunning(config.port)) {
          safeResolve({ success: true, pid: proc.pid });
        } else if (attempts >= maxAttempts) {
          if (proc.pid) {
            try {
              process.kill(proc.pid, 'SIGTERM');
            } catch {
              // Already exited
            }
          }
          safeResolve({
            success: false,
            error: 'Daemon did not start within 30 seconds',
          });
        } else {
          checkTimeout = setTimeout(pollHealth, 1000);
        }
      };
      checkTimeout = setTimeout(pollHealth, 1000);

      proc.on('error', (err) => {
        safeResolve({
          success: false,
          error: `Failed to start daemon: ${err.message}`,
        });
      });

      proc.on('exit', (code, signal) => {
        if (code === null) {
          safeResolve({
            success: false,
            error: `Daemon process was killed by signal ${signal}`,
          });
          return;
        }

        safeResolve({
          success: false,
          error: `Daemon process exited with code ${code}`,
        });
      });
    } catch (err) {
      safeResolve({
        success: false,
        error: `Failed to spawn daemon: ${(err as Error).message}`,
      });
    }
  });
}

/**
 * Stop the copilot-api daemon.
 */
export async function stopDaemon(): Promise<{ success: boolean; error?: string }> {
  const pid = getPidFromFile();
  const configuredPort = getConfiguredCopilotPort();

  if (!pid) {
    // No PID file, try to find by port
    removePidFile();
    return { success: true };
  }

  try {
    const ownership = verifyProcessOwnership(pid, (commandLine) => {
      const lower = commandLine.toLowerCase();
      const hasCopilotApiBinary = /copilot-api(\.cmd|\.exe)?/.test(lower);
      const hasStartCommand = /\bstart\b/.test(lower);
      const hasPortArgument = /--port(?:\s+|=)\d+\b/.test(lower);
      // copilot-api is launched as `... copilot-api start --port <n>`
      return hasCopilotApiBinary && hasStartCommand && hasPortArgument;
    });
    if (ownership === 'not-running') {
      removePidFile();
      return { success: true };
    }

    if (ownership === 'not-owned') {
      // PID was reused by an unrelated process.
      // If daemon is still live on configured port, report failure (stop not completed).
      if (await isDaemonRunning(configuredPort)) {
        return {
          success: false,
          error: `Refusing to clear PID ${pid}: unrelated process owns PID and daemon is still responding on port ${configuredPort}`,
        };
      }
      removePidFile();
      return { success: true };
    }

    if (ownership === 'unknown') {
      // If daemon is not reachable, allow stale PID cleanup.
      if (!(await isDaemonRunning(configuredPort))) {
        removePidFile();
        return { success: true };
      }
      return {
        success: false,
        error: `Refusing to stop PID ${pid}: unable to verify daemon ownership`,
      };
    }

    // Send SIGTERM to the process
    logger.stage('cleanup', 'copilot.daemon.stop', 'Sending SIGTERM to Copilot daemon', {
      provider: 'copilot',
      pid,
    });
    process.kill(pid, 'SIGTERM');

    // Wait for process to exit (up to 5 seconds)
    let attempts = 0;
    while (attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        // Check if process still exists (kill(pid, 0) throws if not)
        process.kill(pid, 0);
        attempts++;
      } catch {
        // Process no longer exists
        break;
      }
    }

    removePidFile();
    return { success: true };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ESRCH') {
      // Process doesn't exist
      removePidFile();
      return { success: true };
    }
    return {
      success: false,
      error: `Failed to stop daemon: ${error.message}`,
    };
  }
}
