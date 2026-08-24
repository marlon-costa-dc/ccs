/**
 * Ordered OAuth alias-pool capability gating — isolated suite.
 *
 * mock.module() replaces the facade-wide binary-manager for every later
 * dynamic import, so this suite must stay alone in its file (same isolation
 * contract as the facade mock suites in 1a5f8fee).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, mock } from 'bun:test';

mock.module('../../binary-manager', () => ({
  getInstalledCliproxyVersion: () => '7.2.135-dc9',
}));

const generator = await import('../generator');

describe('ordered OAuth alias-pool capability gating', () => {
  it('leaves the existing generated config intact when the runtime is below the floor', async () => {
    // Given
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-oauth-alias-gate-'));
    const previousCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempDir;
    const ccsDir = path.join(tempDir, '.ccs');
    const unifiedConfigPath = path.join(ccsDir, 'config.yaml');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      unifiedConfigPath,
      `version: 13\ncliproxy:\n  oauth_accounts: {}\n  providers: []\n  variants:\n    resilient:\n      type: composite\n      default_tier: opus\n      tiers:\n        opus:\n          provider: claude\n          model: claude-opus-4-8\n          fallback_chain:\n            - provider: codex\n              model: gpt-5.5\n        sonnet:\n          provider: claude\n          model: claude-sonnet-4-6\n        haiku:\n          provider: kimi\n          model: kimi-k2.6\n`,
      'utf8'
    );
    const previousConfig = 'port: 8317\n# known-good\n';
    fs.writeFileSync(configPath, previousConfig, 'utf8');
    const { invalidateConfigCache } = await import('../../../config/config-loader-facade');
    invalidateConfigCache();

    try {
      // When / Then
      expect(() => generator.regenerateConfig(8317, { configPath, authDir })).toThrow(
        generator.OrderedOAuthAliasPoolUnsupportedError
      );
      expect(fs.readFileSync(configPath, 'utf8')).toBe(previousConfig);
    } finally {
      if (previousCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = previousCcsHome;
      }
      invalidateConfigCache();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('projects the ordered pool into the regenerated config when the runtime is capable', async () => {
    // Given: capable runtime restored (re-mock before the fresh import).
    mock.module('../../binary-manager', () => ({
      getInstalledCliproxyVersion: () => '7.2.136-dc13',
    }));
    const { invalidateConfigCache } = await import('../../../config/config-loader-facade');
    const freshGenerator = await import('../generator');
    invalidateConfigCache();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-oauth-alias-project-'));
    const previousCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempDir;
    const ccsDir = path.join(tempDir, '.ccs');
    const unifiedConfigPath = path.join(ccsDir, 'config.yaml');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      unifiedConfigPath,
      `version: 13\ncliproxy:\n  oauth_accounts: {}\n  providers: []\n  variants:\n    resilient:\n      type: composite\n      default_tier: opus\n      tiers:\n        opus:\n          provider: claude\n          model: claude-opus-4-8\n          fallback_chain:\n            - provider: codex\n              model: gpt-5.5\n        sonnet:\n          provider: claude\n          model: claude-sonnet-4-6\n        haiku:\n          provider: kimi\n          model: kimi-k2.6\n`,
      'utf8'
    );
    fs.writeFileSync(configPath, 'port: 8317\n', 'utf8');

    try {
      // When
      freshGenerator.regenerateConfig(8317, { configPath, authDir });
      const generated = fs.readFileSync(configPath, 'utf8');

      // Then: the ordered pool alias is projected in config order.
      expect(generated).toContain(
        '  claude:\n    - name: claude-opus-4-8\n      alias: resilient-opus\n      fork: true'
      );
      expect(generated).toContain(
        '  codex:\n    - name: gpt-5.5\n      alias: resilient-opus\n      fork: true'
      );
    } finally {
      if (previousCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = previousCcsHome;
      }
      invalidateConfigCache();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
