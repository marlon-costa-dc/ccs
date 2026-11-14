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
    timeout: 10000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readLoggedArgs(logPath: string): string[] {
  return fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
}

function writeFakeCliproxyBinary(ccsDir: string): void {
  const binDir = path.join(ccsDir, 'cliproxy', 'bin', 'original');
  const binaryPath = path.join(
    binDir,
    process.platform === 'win32' ? 'cli-proxy-api.exe' : 'cli-proxy-api'
  );

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(binaryPath, '#!/bin/sh\nexit 0\n', { encoding: 'utf8', mode: 0o755 });
  fs.chmodSync(binaryPath, 0o755);
}

describe('native Claude effort launch', () => {
  let tmpHome = '';
  let ccsDir = '';
  let settingsPath = '';
  let fakeClaudePath = '';
  let claudeArgsLogPath = '';
  let claudeEnvLogPath = '';
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    if (process.platform === 'win32') return;

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-native-effort-'));
    ccsDir = path.join(tmpHome, '.ccs');
    settingsPath = path.join(ccsDir, 'directapi.settings.json');
    fakeClaudePath = path.join(tmpHome, 'fake-claude.sh');
    claudeArgsLogPath = path.join(tmpHome, 'claude-args.txt');
    claudeEnvLogPath = path.join(tmpHome, 'claude-env.txt');

    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'profiles:',
        '  directapi:',
        '    type: api',
        `    settings: ${settingsPath}`,
        'accounts:',
        '  work:',
        '    created: "2026-05-01T00:00:00.000Z"',
        '    last_used: null',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
        'websearch:',
        '  enabled: false',
        'image_analysis:',
        '  enabled: false',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_API_KEY: 'test-api-key',
            ANTHROPIC_MODEL: 'claude-sonnet-4-6',
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    fs.writeFileSync(
      fakeClaudePath,
      `#!/bin/sh
printf "%s\\n" "$@" > "${claudeArgsLogPath}"
{
  printf "claudeConfigDir=%s\\n" "$CLAUDE_CONFIG_DIR"
  printf "profileType=%s\\n" "$CCS_PROFILE_TYPE"
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
      CCS_CLAUDE_PATH: fakeClaudePath,
      CCS_DEBUG: '1',
      CCS_SKIP_PREFLIGHT: '1',
    };
  });

  afterEach(() => {
    if (process.platform === 'win32') return;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('passes session effort to default native Claude launches', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['--effort', 'High', 'smoke'], baseEnv);

    expect(result.status).toBe(0);
    expect(readLoggedArgs(claudeArgsLogPath)).toEqual(['--effort', 'high', 'smoke']);
    expect(fs.readFileSync(claudeEnvLogPath, 'utf8')).toContain('profileType=default');
  });

  it('keeps default headless native Claude launches out of delegation parsing', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['--effort=low', '-p', 'quick check'], baseEnv);

    expect(result.status).toBe(0);
    expect(readLoggedArgs(claudeArgsLogPath)).toEqual(['--effort=low', '-p', 'quick check']);
  });

  it('passes session effort through account-isolated native Claude launches', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['work', '--effort', 'xhigh', 'smoke'], baseEnv);

    expect(result.status).toBe(0);
    expect(readLoggedArgs(claudeArgsLogPath)).toEqual(['--effort', 'xhigh', 'smoke']);
    const launchedEnv = fs.readFileSync(claudeEnvLogPath, 'utf8');
    expect(launchedEnv).toContain('profileType=account');
    expect(launchedEnv).toContain(path.join(tmpHome, '.ccs', 'instances', 'work'));
  });

  it('passes session effort through native settings-profile Claude launches', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['directapi', '--effort', 'max', 'smoke'], baseEnv);

    expect(result.status).toBe(0);
    expect(readLoggedArgs(claudeArgsLogPath).slice(0, 5)).toEqual([
      '--settings',
      settingsPath,
      '--effort',
      'max',
      'smoke',
    ]);
  });

  it('rejects invalid native Claude effort before spawning Claude', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['--effort', 'turbo', 'smoke'], baseEnv);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid --effort value: turbo');
    expect(result.stderr).toContain('low, medium, high, xhigh, max');
    expect(fs.existsSync(claudeArgsLogPath)).toBe(false);
  });

  it('rejects missing native Claude effort before spawning Claude', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['--effort'], baseEnv);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--effort requires a value');
    expect(fs.existsSync(claudeArgsLogPath)).toBe(false);
  });

  it('keeps CLIProxy-backed Claude effort on the CLIProxy thinking path', () => {
    if (process.platform === 'win32') return;

    writeFakeCliproxyBinary(ccsDir);

    const result = runCcs(['gemini', '--effort', 'minimal', '--accounts'], baseEnv);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No accounts registered');
    expect(result.stderr).toContain('Continuing as alias of `--thinking`');
    expect(result.stderr).not.toContain('Invalid --effort value');
    expect(fs.existsSync(claudeArgsLogPath)).toBe(false);
  });
});
