import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCcs(args: string[], env: NodeJS.ProcessEnv): RunResult {
  const ccsEntry = path.join(process.cwd(), 'src', 'ccs.ts');
  const result = spawnSync(process.execPath, [ccsEntry, ...args], {
    encoding: 'utf8',
    env,
    timeout: 20000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('droid command routing integration', () => {
  let tmpHome: string;
  let ccsDir: string;
  let settingsPath: string;
  let configPath: string;
  let fakeDroidPath: string;
  let droidArgsLogPath: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-droid-route-it-'));
    ccsDir = path.join(tmpHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    settingsPath = path.join(ccsDir, 'myglm.settings.json');
    configPath = path.join(ccsDir, 'config.json');
    fakeDroidPath = path.join(tmpHome, 'fake-droid.js');
    droidArgsLogPath = path.join(tmpHome, 'droid-args.json');

    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://example.invalid/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
            ANTHROPIC_MODEL: 'gpt-5.3-codex',
            CCS_DROID_PROVIDER: 'openai',
          },
        },
        null,
        2
      )
    );

    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          profiles: {
            myglm: settingsPath,
          },
        },
        null,
        2
      )
    );

    fs.writeFileSync(
      fakeDroidPath,
      `#!/usr/bin/env node
const fs = require('fs');
const out = process.env.CCS_TEST_DROID_ARGS_OUT;
if (!out) process.exit(2);
fs.writeFileSync(out, JSON.stringify(process.argv.slice(2)));
process.exit(0);
`,
      { encoding: 'utf8', mode: 0o755 }
    );
    fs.chmodSync(fakeDroidPath, 0o755);

    baseEnv = {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_DROID_PATH: fakeDroidPath,
      CCS_TEST_DROID_ARGS_OUT: droidArgsLogPath,
    };
  });

  afterEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('auto-routes exec-only long flags to droid exec from main ccs flow', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(
      ['myglm', '--target', 'droid', '--skip-permissions-unsafe', 'fix failing tests'],
      baseEnv
    );

    expect(result.status).toBe(0);
    const routedArgs = JSON.parse(fs.readFileSync(droidArgsLogPath, 'utf8')) as string[];
    expect(routedArgs).toEqual(['exec', '--skip-permissions-unsafe', 'fix failing tests']);
  });

  it('auto-routes non-ambiguous short exec flags', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(
      ['myglm', '--target', 'droid', '-m', 'custom:gpt-5.3-codex', 'fix failing tests'],
      baseEnv
    );

    expect(result.status).toBe(0);
    const routedArgs = JSON.parse(fs.readFileSync(droidArgsLogPath, 'utf8')) as string[];
    expect(routedArgs).toEqual(['exec', '-m', 'custom:gpt-5.3-codex', 'fix failing tests']);
  });

  it('dedupes reasoning flags with first occurrence precedence in exec mode', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(
      [
        'myglm',
        '--target',
        'droid',
        'exec',
        '--reasoning-effort',
        'high',
        '--thinking',
        'low',
        'summarize logs',
      ],
      baseEnv
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Multiple reasoning flags detected');
    const routedArgs = JSON.parse(fs.readFileSync(droidArgsLogPath, 'utf8')) as string[];
    expect(routedArgs).toEqual(['exec', '--reasoning-effort', 'high', 'summarize logs']);
  });

  it('fails fast for malformed reasoning alias in command mode', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['myglm', '--target', 'droid', 'exec', '--effort'], baseEnv);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--effort requires a value');
    expect(fs.existsSync(droidArgsLogPath)).toBe(true);
    const probeArgs = JSON.parse(fs.readFileSync(droidArgsLogPath, 'utf8')) as string[];
    // Droid binary is still invoked once for version preflight (`--version`) before routing.
    expect(probeArgs).toEqual(['--version']);
  });
});
