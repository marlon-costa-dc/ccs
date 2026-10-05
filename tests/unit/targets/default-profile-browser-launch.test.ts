import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { request as httpRequest } from 'http';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { once } from 'node:events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mutateUnifiedConfig } from '../../../src/config/unified-config-loader';
import { runWithScopedConfig } from '../../../src/utils/config-manager';

const BROWSER_PROMPT_SNIPPET = 'prefer the CCS MCP Browser tool';

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

async function waitForMockDevtoolsPort(portFilePath: string, timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      const port = fs.readFileSync(portFilePath, 'utf8').trim();
      if (/^\d+$/.test(port)) {
        return port;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for mock DevTools server port to become ready');
}

async function waitForDevtoolsVersionEndpoint(port: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: '127.0.0.1',
            port: Number.parseInt(port, 10),
            path: '/json/version',
            method: 'GET',
          },
          (res) => {
            res.resume();
            if (res.statusCode === 200) {
              resolve();
              return;
            }
            reject(new Error(`Unexpected status: ${res.statusCode ?? 'unknown'}`));
          }
        );
        req.on('error', reject);
        req.end();
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  throw new Error('Timed out waiting for mock DevTools endpoint to become ready');
}

function runCcs(args: string[], env: NodeJS.ProcessEnv): RunResult {
  if (!env.CCS_HOME || !env.CCS_CLAUDE_PATH) {
    throw new Error('CCS launch fixture requires its own HOME and Claude executable');
  }
  expect(env.HOME).toBe(env.CCS_HOME);
  expect(env.USERPROFILE).toBe(env.CCS_HOME);
  expect(env.CCS_DIR).toBe(path.join(env.CCS_HOME, '.ccs'));
  expect(fs.realpathSync(env.CCS_CLAUDE_PATH)).toBe(path.join(env.CCS_HOME, 'bin', 'claude'));
  fs.accessSync(env.CCS_CLAUDE_PATH, fs.constants.X_OK);
  const ccsEntry = path.join(process.cwd(), 'src', 'ccs.ts');
  const result = spawnSync(process.execPath, [ccsEntry, ...args], {
    encoding: 'utf8',
    env,
    timeout: 5000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  if (result.status === 0) {
    const launchedEnv = fs.readFileSync(path.join(env.CCS_HOME, 'claude-env.txt'), 'utf8');
    expect(launchedEnv).toContain(`executable=${env.CCS_CLAUDE_PATH}\n`);
    expect(launchedEnv).toContain(`home=${env.CCS_HOME}\n`);
    expect(launchedEnv).toContain(`ccsDir=${env.CCS_DIR}\n`);
  }

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function reserveClosedPort(): number {
  const server = Bun.serve({
    port: 0,
    fetch() {
      return new Response('ok');
    },
  });
  const { port } = server;
  server.stop(true);
  return port;
}

describe('default profile browser launch', () => {
  let tmpHome = '';
  let fakeClaudePath = '';
  let claudeArgsLogPath = '';
  let claudeEnvLogPath = '';
  let browserProfileDir = '';
  let devtoolsServer: ChildProcess | undefined;
  let baseEnv: NodeJS.ProcessEnv;

  function mutateTestConfig(mutator: Parameters<typeof mutateUnifiedConfig>[0]) {
    return runWithScopedConfig({ ccsHome: tmpHome }, () => mutateUnifiedConfig(mutator));
  }

  beforeEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-default-browser-launch-'));
    const binDir = path.join(tmpHome, 'bin');
    fs.mkdirSync(binDir);
    fakeClaudePath = path.join(binDir, 'claude');
    claudeArgsLogPath = path.join(tmpHome, 'claude-args.txt');
    claudeEnvLogPath = path.join(tmpHome, 'claude-env.txt');
    browserProfileDir = path.join(tmpHome, 'chrome-user-data');

    fs.writeFileSync(
      fakeClaudePath,
      `#!/bin/sh
printf "%s\n" "$@" > "${claudeArgsLogPath}"
{
  printf "executable=%s\n" "$0"
  printf "home=%s\n" "$HOME"
  printf "ccsDir=%s\n" "$CCS_DIR"
  printf "userDataDir=%s\n" "$CCS_BROWSER_USER_DATA_DIR"
  printf "legacyProfileDir=%s\n" "$CCS_BROWSER_PROFILE_DIR"
  printf "host=%s\n" "$CCS_BROWSER_DEVTOOLS_HOST"
  printf "port=%s\n" "$CCS_BROWSER_DEVTOOLS_PORT"
  printf "httpUrl=%s\n" "$CCS_BROWSER_DEVTOOLS_HTTP_URL"
  printf "wsUrl=%s\n" "$CCS_BROWSER_DEVTOOLS_WS_URL"
} > "${claudeEnvLogPath}"
exit 0
`,
      { encoding: 'utf8', mode: 0o755 }
    );
    fs.chmodSync(fakeClaudePath, 0o755);

    baseEnv = {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_DIR: path.join(tmpHome, '.ccs'),
      HOME: tmpHome,
      USERPROFILE: tmpHome,
      XDG_CONFIG_HOME: path.join(tmpHome, '.config'),
      XDG_CACHE_HOME: path.join(tmpHome, '.cache'),
      XDG_DATA_HOME: path.join(tmpHome, '.local', 'share'),
      XDG_STATE_HOME: path.join(tmpHome, '.local', 'state'),
      CLAUDE_CONFIG_DIR: path.join(tmpHome, '.claude'),
      PATH: [binDir, process.env.PATH].filter(Boolean).join(path.delimiter),
      CCS_CLAUDE_PATH: fakeClaudePath,
      CCS_DEBUG: '1',
      CCS_BROWSER_USER_DATA_DIR: '',
      CCS_BROWSER_PROFILE_DIR: '',
      CCS_BROWSER_DEVTOOLS_HOST: '',
      CCS_BROWSER_DEVTOOLS_PORT: '',
      CCS_BROWSER_DEVTOOLS_HTTP_URL: '',
      CCS_BROWSER_DEVTOOLS_WS_URL: '',
      CCS_BROWSER_EVAL_MODE: '',
    };
    delete baseEnv.CCS_CONFIG;
    delete baseEnv.NODE_OPTIONS;
    delete baseEnv.BUN_OPTIONS;
  });

  afterEach(async () => {
    if (devtoolsServer) {
      const child = devtoolsServer;
      devtoolsServer = undefined;
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'close');
        child.kill();
        await closed;
      }
    }
    if (process.platform === 'win32') {
      return;
    }

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('does not consume an empty mock DevTools port file before the port is written', async () => {
    if (process.platform === 'win32') return;

    const delayedPortFile = path.join(tmpHome, 'delayed-port.txt');
    fs.writeFileSync(delayedPortFile, '', 'utf8');
    setTimeout(() => {
      fs.writeFileSync(delayedPortFile, '43123', 'utf8');
    }, 50);

    await expect(waitForMockDevtoolsPort(delayedPortFile, 500)).resolves.toBe('43123');
  });

  it('keeps browser config writes inside the fixture despite an inherited CCS_DIR', () => {
    if (process.platform === 'win32') return;

    const unrelatedConfigDir = path.join(tmpHome, 'unrelated-config');
    fs.mkdirSync(unrelatedConfigDir);
    const originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_DIR = unrelatedConfigDir;
    try {
      mutateTestConfig((config) => {
        if (!config.browser) throw new Error('Fixture requires the declared browser defaults');
        config.browser.claude.enabled = false;
      });
      expect(fs.existsSync(path.join(tmpHome, '.ccs', 'config.yaml'))).toBe(true);
      expect(fs.readdirSync(unrelatedConfigDir)).toEqual([]);
    } finally {
      if (originalCcsDir === undefined) delete process.env.CCS_DIR;
      else process.env.CCS_DIR = originalCcsDir;
    }
  });

  it('ignores stale default Chrome DevTools metadata unless browser reuse is explicitly configured', () => {
    if (process.platform === 'win32') return;

    const defaultChromeDir = path.join(
      tmpHome,
      'Library',
      'Application Support',
      'Google',
      'Chrome'
    );
    fs.mkdirSync(defaultChromeDir, { recursive: true });
    fs.writeFileSync(
      path.join(defaultChromeDir, 'DevToolsActivePort'),
      '9222\n/devtools/browser/stale-default',
      'utf8'
    );

    const result = runCcs(['default', 'smoke'], {
      ...baseEnv,
      HOME: tmpHome,
      USERPROFILE: tmpHome,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('Chrome DevTools endpoint is unreachable');

    const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
    expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);

    const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
    expect(launchedEnv).not.toContain('9222');
    expect(launchedEnv).not.toContain('devtools/browser/stale-default');
  });

  it('does not auto-enable browser runtime for default Claude launches from env overrides alone', async () => {
    if (process.platform === 'win32') return;

    const mockServerScriptPath = path.join(tmpHome, 'mock-devtools-server.js');
    const mockServerPortPath = path.join(tmpHome, 'mock-devtools-port.txt');
    fs.writeFileSync(
      mockServerScriptPath,
      `const { createServer } = require('http');
const fs = require('fs');
const server = createServer((req, res) => {
  if (req.url === '/json/version') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ Browser: 'Chrome/136.0.0.0', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/default-target' }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  fs.writeFileSync(${JSON.stringify(mockServerPortPath)}, String(address.port), 'utf8');
});
`,
      'utf8'
    );

    devtoolsServer = spawn(process.execPath, [mockServerScriptPath], {
      stdio: 'ignore',
      env: baseEnv,
    });

    const port = await waitForMockDevtoolsPort(mockServerPortPath);
    await waitForDevtoolsVersionEndpoint(port);

    fs.mkdirSync(browserProfileDir, { recursive: true });
    fs.writeFileSync(
      path.join(browserProfileDir, 'DevToolsActivePort'),
      `${port}\n/devtools/browser/default-target`,
      'utf8'
    );

    const result = runCcs(['default', 'smoke'], {
      ...baseEnv,
      CCS_BROWSER_PROFILE_DIR: browserProfileDir,
    });

    expect(result.stderr).not.toContain('Browser MCP is enabled, but CCS could not prepare the local browser tool.');
    expect(result.stderr).not.toContain('could not sync the browser MCP config');
    expect(result.stderr).not.toContain('Chrome reuse metadata not found');
    expect(result.status).toBe(0);
    const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
    expect(launchedArgs).not.toContain('--append-system-prompt');
    expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);

    const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
    expect(launchedEnv).not.toContain(`userDataDir=${browserProfileDir}`);
    expect(launchedEnv).not.toContain(`port=${port}`);
    expect(launchedEnv).not.toContain(`httpUrl=http://127.0.0.1:${port}`);
    expect(launchedEnv).not.toContain('wsUrl=ws://127.0.0.1/devtools/browser/default-target');
  });

  it('scrubs inherited CCS_BROWSER_* env from browser-off default Claude launches', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['default', 'smoke'], {
      ...baseEnv,
      CCS_BROWSER_USER_DATA_DIR: '/tmp/stale-browser-runtime',
      CCS_BROWSER_PROFILE_DIR: '/tmp/stale-browser-legacy',
      CCS_BROWSER_DEVTOOLS_HOST: '127.0.0.1',
      CCS_BROWSER_DEVTOOLS_PORT: '9555',
      CCS_BROWSER_DEVTOOLS_HTTP_URL: 'http://127.0.0.1:9555',
      CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/stale-default-env',
    });

    expect(result.status).toBe(0);
    const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
    expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);

    const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
    expect(launchedEnv).not.toContain('/tmp/stale-browser-runtime');
    expect(launchedEnv).not.toContain('/tmp/stale-browser-legacy');
    expect(launchedEnv).not.toContain('9555');
    expect(launchedEnv).not.toContain('stale-default-env');
  });

  it('skips managed browser attach when the default CCS browser profile directory is missing', () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      mutateTestConfig((config) => {
        config.browser = {
          claude: {
            enabled: true,
            policy: 'auto',
            user_data_dir: '',
            devtools_port: 43123,
          },
          codex: {
            enabled: true,
            policy: 'auto',
          },
        };
      });

      const result = runCcs(['default', 'smoke'], {
        ...baseEnv,
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain('Claude Browser Attach is not ready yet.');
      expect(result.stderr).toContain('ccs browser setup');
      expect(result.stderr).toContain('Diagnose only: `ccs browser doctor`.');
      expect(result.stderr).toContain('continue without browser tools');
      expect(fs.existsSync(path.join(tmpHome, '.ccs', 'browser', 'chrome-user-data'))).toBe(true);

      const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
      expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);

      const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
      expect(launchedEnv).toContain('userDataDir=');
      expect(launchedEnv).not.toContain('.ccs/browser/chrome-user-data');
      expect(launchedEnv).not.toContain('ws://127.0.0.1/devtools/browser/');
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('skips managed browser attach when the managed profile exists but no browser session is running', () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      const unreachablePort = reserveClosedPort();
      const managedProfileDir = path.join(tmpHome, '.ccs', 'browser', 'chrome-user-data');
      fs.mkdirSync(managedProfileDir, { recursive: true });

      mutateTestConfig((config) => {
        config.browser = {
          claude: {
            enabled: true,
            policy: 'auto',
            user_data_dir: '',
            devtools_port: unreachablePort,
          },
          codex: {
            enabled: true,
            policy: 'auto',
          },
        };
      });

      const result = runCcs(['default', 'smoke'], {
        ...baseEnv,
      });

      expect(result.status).toBe(0);

      const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
      expect(launchedArgs).not.toContain(BROWSER_PROMPT_SNIPPET);
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('uses config-backed browser attach settings when env overrides are absent', async () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      const mockServerScriptPath = path.join(tmpHome, 'mock-devtools-server.js');
      const mockServerPortPath = path.join(tmpHome, 'mock-devtools-port.txt');
      fs.writeFileSync(
        mockServerScriptPath,
        `const { createServer } = require('http');
const fs = require('fs');
const server = createServer((req, res) => {
  if (req.url === '/json/version') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ Browser: 'Chrome/136.0.0.0', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/config-target' }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  fs.writeFileSync(${JSON.stringify(mockServerPortPath)}, String(address.port), 'utf8');
});
`,
        'utf8'
      );

      devtoolsServer = spawn(process.execPath, [mockServerScriptPath], {
        stdio: 'ignore',
        env: baseEnv,
      });

      const port = await waitForMockDevtoolsPort(mockServerPortPath);
      await waitForDevtoolsVersionEndpoint(port);

      fs.mkdirSync(browserProfileDir, { recursive: true });
      fs.writeFileSync(
        path.join(browserProfileDir, 'DevToolsActivePort'),
        `${port}\n/devtools/browser/config-target`,
        'utf8'
      );

      mutateTestConfig((config) => {
        config.browser = {
          claude: {
            enabled: true,
            policy: 'auto',
            user_data_dir: browserProfileDir,
            devtools_port: Number.parseInt(port, 10),
          },
          codex: {
            enabled: true,
            policy: 'auto',
          },
        };
      });

      const result = runCcs(['default', 'smoke'], {
        ...baseEnv,
      });

      expect(result.status).toBe(0);
      const launchedArgs = fs.readFileSync(claudeArgsLogPath, 'utf8');
      expect(launchedArgs).toContain(BROWSER_PROMPT_SNIPPET);

      const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
      expect(launchedEnv).toContain(`userDataDir=${browserProfileDir}`);
      expect(launchedEnv).toContain(`port=${port}`);
      expect(launchedEnv).toContain('wsUrl=ws://127.0.0.1/devtools/browser/config-target');
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('keeps Claude browser attach hidden under manual policy until --browser is passed', async () => {
    if (process.platform === 'win32') return;

    const mockServerScriptPath = path.join(tmpHome, 'mock-devtools-server-manual-default.js');
    const mockServerPortPath = path.join(tmpHome, 'mock-devtools-port-manual-default.txt');
    fs.writeFileSync(
      mockServerScriptPath,
      `const { createServer } = require('http');
const fs = require('fs');
const server = createServer((req, res) => {
  if (req.url === '/json/version') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ Browser: 'Chrome/136.0.0.0', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/manual-default-target' }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  fs.writeFileSync(${JSON.stringify(mockServerPortPath)}, String(address.port), 'utf8');
});
`,
      'utf8'
    );

    devtoolsServer = spawn(process.execPath, [mockServerScriptPath], {
      stdio: 'ignore',
      env: baseEnv,
    });

    const port = await waitForMockDevtoolsPort(mockServerPortPath);
    await waitForDevtoolsVersionEndpoint(port);

    fs.mkdirSync(browserProfileDir, { recursive: true });
    fs.writeFileSync(
      path.join(browserProfileDir, 'DevToolsActivePort'),
      `${port}\n/devtools/browser/manual-default-target`,
      'utf8'
    );

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      mutateTestConfig((config) => {
        config.browser = {
          claude: {
            enabled: true,
            policy: 'manual',
            user_data_dir: browserProfileDir,
            devtools_port: Number.parseInt(port, 10),
          },
          codex: {
            enabled: true,
            policy: 'auto',
          },
        };
      });

      const hiddenResult = runCcs(['default', 'smoke'], {
        ...baseEnv,
      });
      expect(hiddenResult.status).toBe(0);
      expect(fs.readFileSync(claudeArgsLogPath, 'utf8')).not.toContain(BROWSER_PROMPT_SNIPPET);
      expect(fs.readFileSync(claudeEnvLogPath, 'utf8')).not.toContain(browserProfileDir);

      const forcedResult = runCcs(['default', '--browser', 'smoke'], {
        ...baseEnv,
      });
      expect(forcedResult.status).toBe(0);
      expect(fs.readFileSync(claudeArgsLogPath, 'utf8')).toContain(BROWSER_PROMPT_SNIPPET);
      expect(fs.readFileSync(claudeEnvLogPath, 'utf8')).toContain(browserProfileDir);
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });
});
