/**
 * Tests for `ccs bar` command surface — Phase 3 TDD.
 *
 * Tests run FIRST per TDD mandate.
 * Covers: subcommand routing, bar.json contract, floating-tag install,
 * Info.plist version extraction, capability handshake compat, port-discovery
 * fallback, uninstall, version, and verified review findings #8-#13.
 *
 * All network I/O and filesystem-home operations are mocked.
 * Uses CCS_HOME env var for isolation — never touches real ~/.ccs.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  BAR_AUTH_NONCE_HEADER,
  BAR_AUTH_TOKEN_HEADER,
  createBarAuthProof,
  getOrCreateBarAuthToken,
} from '../../../src/utils/bar-auth-token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let calls: string[] = [];
let consoleOutput: string[] = [];
let tempHome: string;
let originalCcsHome: string | undefined;
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;
function captureConsole(): void {
  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  };
}

function restoreConsole(): void {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
}

// Unique module cache-buster so bun:test picks up fresh mocks each describe block.
let moduleSeq = 0;
async function loadHandleBarCommand() {
  moduleSeq++;
  const mod = await import(`../../../src/commands/bar/index?test=${Date.now()}-${moduleSeq}`);
  return mod.handleBarCommand as (args: string[]) => Promise<void>;
}

async function loadLaunchSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/launch-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarLaunch: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
  };
}

async function loadUninstallSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/uninstall-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarUninstall: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  calls = [];
  consoleOutput = [];
  captureConsole();

  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bar-test-'));
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tempHome;
});

afterEach(() => {
  restoreConsole();
  mock.restore();
  process.exitCode = 0;

  if (originalCcsHome === undefined) {
    delete process.env.CCS_HOME;
  } else {
    process.env.CCS_HOME = originalCcsHome;
  }

  // Clean up temp dir
  try {
    fs.rmSync(tempHome, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// 1. Subcommand routing via handleBarCommand dispatcher
// ---------------------------------------------------------------------------

describe('bar command dispatcher (index.ts)', () => {
  beforeEach(() => {
    mock.module('../../../src/commands/bar/launch-subcommand', () => ({
      handleBarLaunch: async (args: string[]) => {
        calls.push(`launch:${args.join(' ')}`);
      },
    }));

    mock.module('../../../src/commands/bar/install-subcommand', () => ({
      handleBarInstall: async (args: string[]) => {
        calls.push(`install:${args.join(' ')}`);
      },
    }));

    mock.module('../../../src/commands/bar/uninstall-subcommand', () => ({
      handleBarUninstall: async (args: string[]) => {
        calls.push(`uninstall:${args.join(' ')}`);
      },
    }));

    mock.module('../../../src/commands/bar/version-subcommand', () => ({
      handleBarVersion: async () => {
        calls.push(`version:`);
      },
    }));

    mock.module('../../../src/commands/bar/help-subcommand', () => ({
      showHelp: async () => {
        calls.push(`help:`);
      },
    }));
  });

  it('dispatches bare `ccs bar` to launch', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand([]);
    expect(calls).toEqual(['launch:']);
  });

  it('dispatches `ccs bar launch` to launch subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['launch']);
    expect(calls).toEqual(['launch:']);
  });

  it('rejects an unknown bare launch flag without dispatching launch', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['--porrt', '3999']);
    expect(calls).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  it('dispatches `ccs bar install` to install subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['install']);
    expect(calls).toEqual(['install:']);
  });

  it('dispatches `ccs bar uninstall` to uninstall subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['uninstall']);
    expect(calls).toEqual(['uninstall:']);
  });

  it('dispatches `ccs bar --version` to version subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['--version']);
    expect(calls).toEqual(['version:']);
  });

  it('dispatches `ccs bar version` to version subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['version']);
    expect(calls).toEqual(['version:']);
  });

  it('passes remaining args to install subcommand', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['install', '--force']);
    expect(calls).toEqual(['install:--force']);
  });

  it('treats unknown subcommands as an error and does not throw', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    // Should print help or error but not crash
    await expect(handleBarCommand(['unknown-subcommand'])).resolves.toBeUndefined();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('dispatches `ccs bar --help` to help subcommand and does not launch', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['--help']);
    expect(calls).toEqual(['help:']);
    expect(calls).not.toContain(expect.stringMatching(/^launch:/));
  });

  it('dispatches `ccs bar -h` to help subcommand and does not launch', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['-h']);
    expect(calls).toEqual(['help:']);
    expect(calls).not.toContain(expect.stringMatching(/^launch:/));
  });

  it('dispatches `ccs bar help` to help subcommand and does not hit unknown-subcommand error', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['help']);
    expect(calls).toEqual(['help:']);
    const allOutput = consoleOutput.join('\n');
    expect(allOutput).not.toMatch(/Unknown bar subcommand/);
  });
});

// ---------------------------------------------------------------------------
// 2. root-command-router registers `bar`
// ---------------------------------------------------------------------------

describe('root-command-router registers bar', () => {
  beforeEach(() => {
    mock.module('../../../src/commands/bar/index', () => ({
      handleBarCommand: async (args: string[]) => {
        calls.push(`bar:${args.join(' ')}`);
      },
    }));
  });

  it('routes `ccs bar` through the root router', async () => {
    moduleSeq++;
    const mod = await import(
      `../../../src/commands/root-command-router?test=${Date.now()}-${moduleSeq}`
    );
    const { tryHandleRootCommand } = mod;

    const handled = await tryHandleRootCommand(['bar']);
    expect(handled).toBe(true);
    expect(calls).toEqual(['bar:']);
  });

  it('routes `ccs bar install` with args preserved', async () => {
    moduleSeq++;
    const mod = await import(
      `../../../src/commands/root-command-router?test=${Date.now()}-${moduleSeq}`
    );
    const { tryHandleRootCommand } = mod;

    await tryHandleRootCommand(['bar', 'install', '--force']);
    expect(calls).toContain('bar:install --force');
  });
});

// ---------------------------------------------------------------------------
// 3. bar.json contract written by launch
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Detached-model launch dep helpers (shared by tests in this describe block)
// ---------------------------------------------------------------------------

/**
 * Build a minimal set of detached-model deps that behave like a successful
 * launch for most tests. Individual tests override specific deps as needed.
 */
function makeDetachedDeps(ccsDir: string, port = 4242) {
  return {
    findRunningServer: async () => null,
    getPort: async () => port,
    spawnDetachedServer: (_p: number, _log: string) => {
      /* noop */
    },
    waitForServerLive: async (_url: string) => {
      /* live immediately */
    },
    writeLaunchDescriptor: () => {
      /* noop */
    },
    openApp: async (_appPath: string) => {
      /* noop */
    },
    getCcsDir: () => ccsDir,
    appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
  };
}

describe('bar.json contract (launch subcommand)', () => {
  it('writes ~/.ccs/bar.json with correct shape when server starts', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      ...makeDetachedDeps(ccsDir, 4242),
      openApp: async (_appPath: string) => {
        calls.push(`open:${_appPath}`);
      },
    });

    const barJsonPath = path.join(ccsDir, 'bar.json');
    expect(fs.existsSync(barJsonPath)).toBe(true);

    const barJson = JSON.parse(fs.readFileSync(barJsonPath, 'utf8')) as unknown;
    expect(barJson).toMatchObject({
      baseUrl: 'http://127.0.0.1:4242',
      port: 4242,
      authMode: 'loopback',
    });
  });

  it('bar.json authMode is always "loopback" in v1', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], makeDetachedDeps(ccsDir, 9000));

    const barJson = JSON.parse(fs.readFileSync(path.join(ccsDir, 'bar.json'), 'utf8')) as {
      authMode: string;
    };
    expect(barJson.authMode).toBe('loopback');
  });

  it('prints guidance when app is not installed', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    // App doesn't exist at appInstallPath — openApp throws so degraded path runs.
    const nonExistentApp = path.join(tempHome, 'Applications', 'CCS Bar.app');

    await handleBarLaunch([], {
      ...makeDetachedDeps(ccsDir, 3000),
      openApp: async () => {
        throw new Error('App not found');
      },
      appInstallPath: nonExistentApp,
    });

    const allOutput = consoleOutput.join('\n');
    // Should suggest installation
    expect(allOutput.toLowerCase()).toMatch(/install|not found|ccs bar install/i);
  });

  it('writes bar.json even when open fails (degraded path)', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      ...makeDetachedDeps(ccsDir, 3001),
      openApp: async () => {
        throw new Error('open failed');
      },
    });

    // bar.json should still be written despite open failure
    const barJsonPath = path.join(ccsDir, 'bar.json');
    expect(fs.existsSync(barJsonPath)).toBe(true);
  });

  it('prints degraded-path warning when spawnDetachedServer throws', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      ...makeDetachedDeps(ccsDir, 3000),
      spawnDetachedServer: () => {
        throw new Error('spawn failed');
      },
    });

    const allOutput = consoleOutput.join('\n');
    expect(allOutput.toLowerCase()).toMatch(/error|failed|could not|unable/i);
  });
});


// ---------------------------------------------------------------------------
// --port support: `ccs bar [launch] --port N` (user-selectable dashboard port)
// ---------------------------------------------------------------------------

describe('bar dispatcher: bare flags route to launch', () => {
  beforeEach(() => {
    mock.module('../../../src/commands/bar/launch-subcommand', () => ({
      handleBarLaunch: async (args: string[]) => {
        calls.push(`launch:${args.join(' ')}`);
      },
    }));
  });

  it('dispatches `ccs bar --port 3999` to launch with the flag preserved', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['--port', '3999']);
    expect(calls).toEqual(['launch:--port 3999']);
  });

  it('dispatches `ccs bar launch --port 3999` to launch with the flag preserved', async () => {
    const handleBarCommand = await loadHandleBarCommand();
    await handleBarCommand(['launch', '--port', '3999']);
    expect(calls).toEqual(['launch:--port 3999']);
  });
});

describe('launch: --port selects the server port', () => {
  function makePortDeps(ccsDir: string) {
    const seen: {
      spawnPort: number | null;
      getPortCandidates: number[] | null;
      stopped: boolean;
      descriptorPort: number | null;
    } = { spawnPort: null, getPortCandidates: null, stopped: false, descriptorPort: null };

    const deps = {
      findRunningServer: async () => null,
      getPort: async (opts: { port: number[]; host: string }) => {
        seen.getPortCandidates = opts.port;
        return opts.port[0];
      },
      spawnDetachedServer: (p: number) => {
        seen.spawnPort = p;
      },
      waitForServerLive: async () => {},
      createLaunchDescriptor: (opts?: { port?: number }) => {
        seen.descriptorPort = opts?.port ?? null;
        return {
          schema: 1 as const,
          runtime: '/usr/bin/node',
          args: ['/x/ccs.js', 'bar', 'serve'],
          home: '/h',
        };
      },
      writeLaunchDescriptor: () => {},
      stopDetachedServer: () => {
        seen.stopped = true;
      },
      openApp: async () => {},
      getCcsDir: () => ccsDir,
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    };
    return { deps, seen };
  }

  it('spawns the detached server on the requested port and records it in bar.json', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps, seen } = makePortDeps(ccsDir);

    await handleBarLaunch(['--port', '3999'], deps);

    expect(seen.spawnPort).toBe(3999);
    const barJson = JSON.parse(fs.readFileSync(path.join(ccsDir, 'bar.json'), 'utf8')) as {
      port: number;
      baseUrl: string;
    };
    expect(barJson.port).toBe(3999);
    expect(barJson.baseUrl).toBe('http://127.0.0.1:3999');
  });

  it('persists the chosen port into the launch descriptor for app self-start', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps, seen } = makePortDeps(ccsDir);

    await handleBarLaunch(['--port', '3999'], deps);

    expect(seen.descriptorPort).toBe(3999);
  });

  it('errors without spawning when the requested port is busy', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps, seen } = makePortDeps(ccsDir);
    deps.getPort = async () => 4001; // get-port fell back: 3999 not free

    await handleBarLaunch(['--port', '3999'], deps);

    expect(seen.spawnPort).toBeNull();
    const allOutput = consoleOutput.join('\n');
    expect(allOutput).toMatch(/3999/);
    expect(allOutput.toLowerCase()).toMatch(/in use|busy|not free|unavailable/);
  });

  it('errors on an invalid --port value', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps, seen } = makePortDeps(ccsDir);

    await handleBarLaunch(['--port', 'banana'], deps);

    expect(seen.spawnPort).toBeNull();
    expect(consoleOutput.join('\n').toLowerCase()).toMatch(/invalid.*port|port.*invalid/);
  });

  it('reuses a running server already on the requested port', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps, seen } = makePortDeps(ccsDir);
    deps.findRunningServer = async () => ({ port: 3999, baseUrl: 'http://127.0.0.1:3999' });

    await handleBarLaunch(['--port', '3999'], deps);

    expect(seen.spawnPort).toBeNull(); // reuse, no new spawn
    expect(seen.stopped).toBe(false);
    const barJson = JSON.parse(fs.readFileSync(path.join(ccsDir, 'bar.json'), 'utf8')) as {
      port: number;
    };
    expect(barJson.port).toBe(3999);
  });

  it('stops a running server on a different port, then starts on the requested one', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps, seen } = makePortDeps(ccsDir);
    deps.findRunningServer = async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' });

    await handleBarLaunch(['--port', '3999'], deps);

    expect(seen.stopped).toBe(true);
    expect(seen.spawnPort).toBe(3999);
    const barJson = JSON.parse(fs.readFileSync(path.join(ccsDir, 'bar.json'), 'utf8')) as {
      port: number;
    };
    expect(barJson.port).toBe(3999);
  });

  it('preflights the destination before stopping a healthy running server', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps } = makePortDeps(ccsDir);
    const events: string[] = [];
    deps.findRunningServer = async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' });
    deps.getPort = async () => {
      events.push('preflight');
      return 3999;
    };
    deps.stopDetachedServer = () => {
      events.push('stop');
    };

    await handleBarLaunch(['--port', '3999'], deps);
    expect(events).toEqual(['preflight', 'stop']);
  });

  it('leaves the healthy server running when destination preflight is busy', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps, seen } = makePortDeps(ccsDir);
    deps.findRunningServer = async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' });
    deps.getPort = async () => 4000;

    await handleBarLaunch(['--port', '3999'], deps);
    expect(seen.stopped).toBe(false);
    expect(seen.spawnPort).toBeNull();
  });

  it('aborts the move when the verified stop fails', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps, seen } = makePortDeps(ccsDir);
    deps.findRunningServer = async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' });
    deps.stopDetachedServer = () => {
      throw new Error('identity mismatch');
    };

    await handleBarLaunch(['--port', '3999'], deps);
    expect(seen.spawnPort).toBeNull();
  });

  it('restores the prior server when a check-to-bind race breaks the replacement', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps } = makePortDeps(ccsDir);
    const spawnedPorts: number[] = [];
    deps.findRunningServer = async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' });
    deps.spawnDetachedServer = (port: number) => {
      spawnedPorts.push(port);
    };
    deps.waitForServerLive = async (baseUrl: string) => {
      if (baseUrl.endsWith(':3999')) throw new Error('EADDRINUSE after preflight');
    };

    await handleBarLaunch(['--port', '3999'], deps);
    expect(spawnedPorts).toEqual([3999, 3000]);
  });

  it('restores the prior server when replacement spawn fails', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps } = makePortDeps(ccsDir);
    const spawnedPorts: number[] = [];
    deps.findRunningServer = async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' });
    deps.spawnDetachedServer = (port: number) => {
      spawnedPorts.push(port);
      if (port === 3999) throw new Error('spawn failed');
    };

    await handleBarLaunch(['--port', '3999'], deps);
    expect(spawnedPorts).toEqual([3999, 3000]);
  });

  it('preserves prior discovery state when replacement and rollback both fail', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(path.join(ccsDir, 'bar'), { recursive: true });
    const oldBarJson = JSON.stringify({
      baseUrl: 'http://127.0.0.1:3000',
      port: 3000,
      authMode: 'loopback',
    });
    const oldLaunchJson = JSON.stringify({ args: ['ccs.js', 'bar', 'serve', '--port', '3000'] });
    fs.writeFileSync(path.join(ccsDir, 'bar.json'), oldBarJson);
    fs.writeFileSync(path.join(ccsDir, 'bar', 'launch.json'), oldLaunchJson);
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps } = makePortDeps(ccsDir);
    deps.findRunningServer = async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' });
    deps.spawnDetachedServer = () => {
      throw new Error('spawn failed');
    };

    await handleBarLaunch(['--port', '3999'], deps);
    expect(fs.readFileSync(path.join(ccsDir, 'bar.json'), 'utf8')).toBe(oldBarJson);
    expect(fs.readFileSync(path.join(ccsDir, 'bar', 'launch.json'), 'utf8')).toBe(oldLaunchJson);
  });

  it('without --port, prefers the port recorded in bar.json (sticky port)', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'bar.json'),
      JSON.stringify({ baseUrl: 'http://127.0.0.1:3777', port: 3777, authMode: 'loopback' })
    );
    const { handleBarLaunch } = await loadLaunchSubcommand();
    const { deps, seen } = makePortDeps(ccsDir);

    await handleBarLaunch([], deps);

    expect(seen.getPortCandidates?.[0]).toBe(3777);
    expect(seen.spawnPort).toBe(3777);
  });
});

describe('resolveBarPort: launch.json fallback survives `ccs bar stop`', () => {
  // `ccs bar stop` deletes bar.json, so bar.json alone cannot carry the sticky
  // port across a stop/start cycle. launch.json (refreshed by launch, NOT
  // deleted by stop) records the port in its args and acts as the fallback.
  it('falls back to the --port recorded in launch.json when bar.json is absent', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(path.join(ccsDir, 'bar'), { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'bar', 'launch.json'),
      JSON.stringify({
        schema: 1,
        runtime: '/usr/bin/node',
        args: ['/x/ccs.js', 'bar', 'serve', '--port', '3456'],
        home: tempHome,
      })
    );

    const { resolveBarPort } = await loadLaunchSubcommand();
    expect(resolveBarPort(ccsDir)).toBe(3456);
  });

  it('bar.json port wins over launch.json when both exist', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(path.join(ccsDir, 'bar'), { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'bar.json'),
      JSON.stringify({ baseUrl: 'http://127.0.0.1:4000', port: 4000, authMode: 'loopback' })
    );
    fs.writeFileSync(
      path.join(ccsDir, 'bar', 'launch.json'),
      JSON.stringify({
        schema: 1,
        runtime: '/usr/bin/node',
        args: ['/x/ccs.js', 'bar', 'serve', '--port', '3456'],
        home: tempHome,
      })
    );

    const { resolveBarPort } = await loadLaunchSubcommand();
    expect(resolveBarPort(ccsDir)).toBe(4000);
  });

  it('returns null when launch.json has no --port and bar.json is absent', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(path.join(ccsDir, 'bar'), { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'bar', 'launch.json'),
      JSON.stringify({
        schema: 1,
        runtime: '/usr/bin/node',
        args: ['/x/ccs.js', 'bar', 'serve'],
        home: tempHome,
      })
    );

    const { resolveBarPort } = await loadLaunchSubcommand();
    expect(resolveBarPort(ccsDir)).toBeNull();
  });
});
