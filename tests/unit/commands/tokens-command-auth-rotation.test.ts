import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import { setGlobalConfigDir } from '../../../src/utils/config-manager';

const REPO_ROOT = path.resolve(import.meta.dir, '../../..');
const TOKENS_COMMAND_URL = pathToFileURL(
  path.join(REPO_ROOT, 'src/commands/tokens-command.ts')
).href;
const UNIFIED_CONFIG_LOADER_URL = pathToFileURL(
  path.join(REPO_ROOT, 'src/config/unified-config-loader.ts')
).href;

function withScopedTokensHome<T>(run: (tempHome: string) => T): T {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-tokens-rotation-'));
  setGlobalConfigDir(undefined);

  try {
    return run(tempHome);
  } finally {
    setGlobalConfigDir(undefined);
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function runTokensCommandInChild(tempHome: string, args: string[]) {
  const script = `
    import { handleTokensCommand } from ${JSON.stringify(TOKENS_COMMAND_URL)};
    import { loadUnifiedConfig } from ${JSON.stringify(UNIFIED_CONFIG_LOADER_URL)};

    const exitCode = await handleTokensCommand(${JSON.stringify(args)});
    const config = loadUnifiedConfig();
    const managementSecret = config?.cliproxy.auth?.management_secret ?? null;

    console.log(JSON.stringify({
      exitCode,
      apiKey: config?.cliproxy.auth?.api_key ?? null,
      managementSecretLength: typeof managementSecret === 'string' ? managementSecret.length : 0,
    }));
  `;

  const scriptPath = path.join(tempHome, `tokens-child-${Date.now()}.mjs`);
  fs.writeFileSync(scriptPath, script, 'utf8');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      CCS_HOME: tempHome,
      CCS_DIR: '',
      NO_COLOR: '1',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(
      `child tokens command failed: ${JSON.stringify({
        command: `${process.execPath} ${scriptPath}`,
        status: result.status,
        signal: result.signal,
        error: result.error?.message ?? null,
        stdout: result.stdout,
        stderr: result.stderr,
      })}`
    );
  }

  const lines = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const payload = JSON.parse(lines.at(-1) || '{}') as {
    exitCode: number;
    apiKey: string | null;
    managementSecretLength: number;
  };

  return { payload, stdout: result.stdout, stderr: result.stderr };
}

describe('tokens command auth rotation', () => {
  it('applies api-key and regenerated secret in a single invocation', () => {
    withScopedTokensHome((tempHome) => {
      const { payload } = runTokensCommandInChild(tempHome, [
        '--api-key',
        'ccs-custom-key-123',
        '--regenerate-secret',
      ]);
      const configYamlPath = path.join(tempHome, '.ccs', 'config.yaml');

      const diagnostics = {
        exitCode: payload.exitCode,
        configYamlPath,
        configExists: fs.existsSync(configYamlPath),
        apiKey: payload.apiKey,
        managementSecretLength: payload.managementSecretLength,
      };

      if (
        payload.exitCode !== 0 ||
        payload.apiKey !== 'ccs-custom-key-123' ||
        payload.managementSecretLength <= 20
      ) {
        throw new Error(`tokens rotation diagnostics: ${JSON.stringify(diagnostics)}`);
      }
    });
  });

  it('rejects conflicting manual and generated secret flags', () => {
    withScopedTokensHome((tempHome) => {
      const { payload } = runTokensCommandInChild(tempHome, [
        '--secret',
        'manual-secret',
        '--regenerate-secret',
      ]);

      expect(payload.exitCode).toBe(1);
      expect(fs.existsSync(path.join(tempHome, '.ccs', 'config.yaml'))).toBe(false);
    });
  });
});
