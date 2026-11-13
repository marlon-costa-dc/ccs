import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as yaml from 'js-yaml';

import {
  ClaudeSettingsChecker,
  ConfigFilesChecker,
  clearUnloadableModelPipeline,
} from '../../../../src/management/checks/config-check';
import { loadUnifiedConfig } from '../../../../src/config/config-loader-facade';
import { modelPipelineConfigFixture } from '../../../../src/config/schemas/__tests__/fixtures/model-pipeline-v3-fixture';
import { createEmptyUnifiedConfig } from '../../../../src/config/schemas/unified-config';
import { HealthCheck } from '../../../../src/management/checks/types';
import { runWithScopedCcsHome } from '../../../../src/utils/config-manager';
import { CLIPROXY_DEFAULT_PORT } from '../../../../src/cliproxy/config/port-manager';

let originalClaudeConfigDir: string | undefined;

afterEach(() => {
  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
  }
});

describe('ClaudeSettingsChecker', () => {
  it('warns when Claude settings point at the Codex CLIProxy translator', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-check-'));
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;

    try {
      await runWithScopedCcsHome(tempRoot, async () => {
        const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(
          settingsPath,
          JSON.stringify(
            {
              env: {
                ANTHROPIC_BASE_URL: `http://127.0.0.1:${CLIPROXY_DEFAULT_PORT}/api/provider/codex`,
              },
            },
            null,
            2
          ) + '\n'
        );

        const originalConsoleLog = console.log;
        console.log = () => {};
        try {
          const results = new HealthCheck();
          new ClaudeSettingsChecker().run(results);

          expect(results.warnings).toHaveLength(1);
          expect(results.warnings[0].message).toContain('Codex CLIProxy translator');
          expect(results.warnings[0].fix).toContain('ccs persist default --yes');
        } finally {
          console.log = originalConsoleLog;
        }
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('warns with safe path-level evidence for nested Codex translator settings', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-check-'));
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;

    try {
      await runWithScopedCcsHome(tempRoot, async () => {
        const staleUrl = 'https://proxy.example.com/api/provider/codex/v1/messages';
        const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(
          settingsPath,
          JSON.stringify(
            {
              env: {
                KEEP_ME: 'safe',
              },
              hooks: {
                PostToolUse: [
                  {
                    config: {
                      endpoint: staleUrl,
                    },
                  },
                ],
              },
            },
            null,
            2
          ) + '\n'
        );

        const originalConsoleLog = console.log;
        const capturedLogs: string[] = [];
        console.log = (...args: unknown[]) => {
          capturedLogs.push(args.map((arg) => String(arg)).join(' '));
        };
        try {
          const results = new HealthCheck();
          new ClaudeSettingsChecker().run(results);

          expect(results.warnings).toHaveLength(1);
          expect(results.warnings[0].message).toContain(
            'hooks.PostToolUse[0].config.endpoint'
          );
          expect(results.warnings[0].message).not.toContain(staleUrl);
          expect(capturedLogs.join('\n')).toContain('hooks.PostToolUse[0].config.endpoint');
          expect(capturedLogs.join('\n')).not.toContain(staleUrl);
        } finally {
          console.log = originalConsoleLog;
        }
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('ConfigFilesChecker model_pipeline block', () => {
  function writeConfig(tempRoot: string, pipeline: Record<string, unknown>): string {
    const configPath = path.join(tempRoot, '.ccs', 'config.yaml');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      yaml.dump({ ...createEmptyUnifiedConfig(), model_pipeline: pipeline }),
      { mode: 0o600 }
    );
    return configPath;
  }

  function staleReceiptPipeline(): Record<string, unknown> {
    const pipeline = modelPipelineConfigFixture();
    const receipt = pipeline.receipt as Record<string, unknown>;
    receipt.cliproxy_binary = {
      ...(receipt.cliproxy_binary as Record<string, unknown>),
      commit: 'swapped-cliproxy-commit',
    };
    return pipeline;
  }

  function runCheck(): HealthCheck {
    const originalConsoleLog = console.log;
    console.log = () => {};
    try {
      const results = new HealthCheck();
      new ConfigFilesChecker().run(results);
      return results;
    } finally {
      console.log = originalConsoleLog;
    }
  }

  it('reports the parser message for a block the loader rejects and leaves the file alone', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-check-'));
    try {
      await runWithScopedCcsHome(tempRoot, async () => {
        const configPath = writeConfig(tempRoot, staleReceiptPipeline());
        const before = fs.readFileSync(configPath, 'utf8');

        const results = runCheck();

        expect(results.isHealthy()).toBe(false);
        expect(results.errors).toHaveLength(1);
        expect(results.errors[0].name).toBe('config.yaml');
        expect(results.errors[0].message).toContain(
          'model_pipeline.receipt.cliproxy_binary must equal snapshot.inventory.binary_provenance'
        );
        expect(results.errors[0].fix).toContain('ccs doctor --fix');
        expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('reports a loadable block as valid and has nothing to clear', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-check-'));
    try {
      await runWithScopedCcsHome(tempRoot, async () => {
        const configPath = writeConfig(tempRoot, modelPipelineConfigFixture());
        const before = fs.readFileSync(configPath, 'utf8');

        expect(runCheck().errors).toHaveLength(0);
        expect(clearUnloadableModelPipeline()).toBeNull();
        expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('fix clears only the unloadable block so the config loads again', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-check-'));
    try {
      await runWithScopedCcsHome(tempRoot, async () => {
        const pipeline = staleReceiptPipeline();
        const configPath = writeConfig(tempRoot, pipeline);
        const before = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
        expect(() => loadUnifiedConfig()).toThrow('Invalid config format');

        const active = (pipeline.receipt as { active: Record<string, unknown> }).active;
        const cleared = clearUnloadableModelPipeline();
        expect(cleared).toContain(`generation ${active.generation}`);
        expect(cleared).toContain(`snapshot_digest ${active.snapshot_digest}`);

        const after = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
        const { model_pipeline: _removed, ...expected } = before;
        expect(after).toEqual(expected);
        expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
        expect(fs.readdirSync(path.dirname(configPath))).toEqual(['config.yaml']);
        expect(loadUnifiedConfig()?.model_pipeline).toBeUndefined();
        expect(runCheck().errors).toHaveLength(0);
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('fix reports a block without a readable identity as unparseable', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-check-'));
    try {
      await runWithScopedCcsHome(tempRoot, async () => {
        const configPath = writeConfig(tempRoot, { schema_version: 3 });

        expect(clearUnloadableModelPipeline()).toContain('unparseable block');
        const after = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
        expect(after.model_pipeline).toBeUndefined();
        expect(after.version).toBe(createEmptyUnifiedConfig().version);
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
