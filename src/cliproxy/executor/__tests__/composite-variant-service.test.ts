/**
 * Unit tests for composite variant service operations
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createCompositeVariant, updateCompositeVariant } from '../../services/variant-service';
import {
  saveCompositeVariantUnified,
  listVariantsFromConfig,
} from '../../services/variant-config-adapter';
import { CompositeVariantConfig } from '../../../config/unified-config-types';

describe('updateCompositeVariant', () => {
  let tmpDir: string;
  let originalCcsDir: string | undefined;

  beforeEach(() => {
    // Create temp directory for isolated config
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-composite-test-'));
    originalCcsDir = process.env.CCS_DIR;
    // Use CCS_DIR (not CCS_HOME which appends .ccs)
    process.env.CCS_DIR = tmpDir;

    // Create unified config file
    const configDir = tmpDir;
    const configPath = path.join(configDir, 'config.yaml');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      configPath,
      `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants: {}
`,
      'utf-8'
    );
  });

  afterEach(() => {
    // Restore original CCS_DIR
    if (originalCcsDir !== undefined) {
      process.env.CCS_DIR = originalCcsDir;
    } else {
      delete process.env.CCS_DIR;
    }

    // Clean up temp directory
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should update partial tier config (only opus model)', () => {
    // Setup: Create initial composite variant
    const initialConfig: CompositeVariantConfig = {
      type: 'composite',
      default_tier: 'sonnet',
      tiers: {
        opus: { provider: 'gemini', model: 'gemini-3-pro-preview' },
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6' },
        haiku: { provider: 'agy', model: 'claude-haiku-4-5-20251001' },
      },
      settings: 'cliproxy/composite-test.settings.json',
      port: 8318,
    };
    saveCompositeVariantUnified('test', initialConfig);

    // Create dummy settings file to avoid deletion error
    const settingsDir = path.join(tmpDir, 'cliproxy');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'composite-test.settings.json'),
      JSON.stringify({ env: {} }),
      'utf-8'
    );

    // Test: Update only opus tier
    const result = updateCompositeVariant('test', {
      tiers: {
        opus: { provider: 'agy', model: 'claude-opus-4-6-thinking' },
      },
    });

    expect(result.success).toBe(true);
    expect(result.variant?.tiers?.opus.model).toBe('claude-opus-4-6-thinking');
    expect(result.variant?.tiers?.sonnet.model).toBe('claude-sonnet-4-6'); // Unchanged
    expect(result.variant?.tiers?.haiku.model).toBe('claude-haiku-4-5-20251001'); // Unchanged
  });

  it('should update default tier', () => {
    // Setup: Create initial composite variant
    const initialConfig: CompositeVariantConfig = {
      type: 'composite',
      default_tier: 'sonnet',
      tiers: {
        opus: { provider: 'gemini', model: 'gemini-3-pro-preview' },
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6' },
        haiku: { provider: 'agy', model: 'claude-haiku-4-5-20251001' },
      },
      settings: 'cliproxy/composite-test.settings.json',
      port: 8318,
    };
    saveCompositeVariantUnified('test', initialConfig);

    // Create dummy settings file
    const settingsDir = path.join(tmpDir, 'cliproxy');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'composite-test.settings.json'),
      JSON.stringify({ env: {} }),
      'utf-8'
    );

    // Test: Update default tier
    const result = updateCompositeVariant('test', {
      defaultTier: 'opus',
    });

    expect(result.success).toBe(true);
    expect(result.variant?.default_tier).toBe('opus');
    expect(result.variant?.provider).toBe('gemini'); // Provider from opus tier
  });

  it('should update all tiers', () => {
    // Setup: Create initial composite variant
    const initialConfig: CompositeVariantConfig = {
      type: 'composite',
      default_tier: 'sonnet',
      tiers: {
        opus: { provider: 'gemini', model: 'gemini-3-pro-preview' },
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6' },
        haiku: { provider: 'agy', model: 'claude-haiku-4-5-20251001' },
      },
      settings: 'cliproxy/composite-test.settings.json',
      port: 8318,
    };
    saveCompositeVariantUnified('test', initialConfig);

    // Create dummy settings file
    const settingsDir = path.join(tmpDir, 'cliproxy');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'composite-test.settings.json'),
      JSON.stringify({ env: {} }),
      'utf-8'
    );

    // Test: Update all tiers
    const result = updateCompositeVariant('test', {
      tiers: {
        opus: { provider: 'agy', model: 'claude-opus-4-6-thinking' },
        sonnet: { provider: 'codex', model: 'codex-sonnet-4-5' },
        haiku: { provider: 'gemini', model: 'gemini-2.5-flash' },
      },
    });

    expect(result.success).toBe(true);
    expect(result.variant?.tiers?.opus.provider).toBe('agy');
    expect(result.variant?.tiers?.sonnet.provider).toBe('codex');
    expect(result.variant?.tiers?.haiku.provider).toBe('gemini');
  });

  it('should preserve optional tier fields when updating provider/model only', () => {
    const initialConfig: CompositeVariantConfig = {
      type: 'composite',
      default_tier: 'sonnet',
      tiers: {
        opus: {
          provider: 'agy',
          model: 'claude-opus-4-6-thinking',
          fallback: { provider: 'gemini', model: 'gemini-2.5-flash' },
          thinking: 'xhigh',
          account: 'team-a',
        },
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6' },
        haiku: { provider: 'agy', model: 'claude-haiku-4-5-20251001' },
      },
      settings: 'cliproxy/composite-test.settings.json',
      port: 8318,
    };
    saveCompositeVariantUnified('test', initialConfig);

    const settingsDir = path.join(tmpDir, 'cliproxy');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'composite-test.settings.json'),
      JSON.stringify({ env: {} }),
      'utf-8'
    );

    const result = updateCompositeVariant('test', {
      tiers: {
        opus: { provider: 'gemini', model: 'gemini-2.5-pro' },
      },
    });

    expect(result.success).toBe(true);
    expect(result.variant?.tiers?.opus.provider).toBe('gemini');
    expect(result.variant?.tiers?.opus.model).toBe('gemini-2.5-pro');
    expect(result.variant?.tiers?.opus.fallback).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    expect(result.variant?.tiers?.opus.thinking).toBe('xhigh');
    expect(result.variant?.tiers?.opus.account).toBe('team-a');
  });

  it('should preserve existing custom settings path and custom settings fields', () => {
    const customSettingsPath = path.join(tmpDir, 'custom', 'my-composite.settings.json');
    const initialConfig: CompositeVariantConfig = {
      type: 'composite',
      default_tier: 'sonnet',
      tiers: {
        opus: { provider: 'gemini', model: 'gemini-3-pro-preview' },
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6' },
        haiku: { provider: 'agy', model: 'claude-haiku-4-5-20251001' },
      },
      settings: customSettingsPath,
      port: 8318,
    };
    saveCompositeVariantUnified('test', initialConfig);

    fs.mkdirSync(path.dirname(customSettingsPath), { recursive: true });
    fs.writeFileSync(
      customSettingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8318',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'claude-sonnet-4-6',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'gemini-3-pro-preview',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
            CUSTOM_ENV: 'preserve-this',
          },
          hooks: { PreToolUse: [{ matcher: 'WebSearch', hooks: [] }] },
          customPreset: true,
        },
        null,
        2
      ),
      'utf-8'
    );

    const result = updateCompositeVariant('test', {
      tiers: {
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6(high)' },
      },
    });

    expect(result.success).toBe(true);
    expect(result.variant?.settings).toBe(customSettingsPath);

    const updatedSettings = JSON.parse(fs.readFileSync(customSettingsPath, 'utf-8')) as {
      env: Record<string, string>;
      hooks: { PreToolUse: unknown[] };
      customPreset: boolean;
    };
    expect(updatedSettings.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6(high)');
    expect(updatedSettings.env.CUSTOM_ENV).toBe('preserve-this');
    expect(updatedSettings.hooks.PreToolUse.length).toBe(1);
    expect(updatedSettings.customPreset).toBe(true);

    const variants = listVariantsFromConfig();
    expect(variants.test.settings).toBe(customSettingsPath);
  });

  it('should return error when variant does not exist', () => {
    const result = updateCompositeVariant('nonexistent', {
      tiers: {
        opus: { provider: 'agy', model: 'claude-opus-4-6-thinking' },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should return error when variant is not composite type', () => {
    // Setup: Create non-composite variant in unified config
    const configPath = path.join(tmpDir, 'config.yaml');
    const yamlContent = `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants:
    simple:
      provider: gemini
      settings: cliproxy/simple.settings.json
      port: 8318
`;
    fs.writeFileSync(configPath, yamlContent, 'utf-8');

    const result = updateCompositeVariant('simple', {
      tiers: {
        opus: { provider: 'agy', model: 'claude-opus-4-6-thinking' },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not a composite variant');
  });
});

describe('createCompositeVariant', () => {
  let tmpDir: string;
  let originalCcsDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-composite-test-'));
    originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_DIR = tmpDir;

    const configPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants: {}
`,
      'utf-8'
    );
  });

  afterEach(() => {
    if (originalCcsDir !== undefined) {
      process.env.CCS_DIR = originalCcsDir;
    } else {
      delete process.env.CCS_DIR;
    }

    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns validation error for missing required tier in create flow', () => {
    const result = createCompositeVariant({
      name: 'broken',
      defaultTier: 'sonnet',
      tiers: {
        opus: { provider: 'gemini', model: 'gemini-2.5-pro' },
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6' },
      } as unknown as {
        opus: { provider: 'gemini' | 'codex' | 'agy'; model: string };
        sonnet: { provider: 'gemini' | 'codex' | 'agy'; model: string };
        haiku: { provider: 'gemini' | 'codex' | 'agy'; model: string };
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required tier 'haiku'");
  });

  it('returns validation error for null tier payload in create flow', () => {
    const result = createCompositeVariant({
      name: 'broken-null',
      defaultTier: 'sonnet',
      tiers: {
        opus: null,
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6' },
        haiku: { provider: 'agy', model: 'claude-haiku-4-5-20251001' },
      } as unknown as {
        opus: { provider: 'gemini' | 'codex' | 'agy'; model: string };
        sonnet: { provider: 'gemini' | 'codex' | 'agy'; model: string };
        haiku: { provider: 'gemini' | 'codex' | 'agy'; model: string };
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid tier config for 'opus'");
  });

  it('stores composite settings path under active CCS_DIR', () => {
    const result = createCompositeVariant({
      name: 'scoped',
      defaultTier: 'sonnet',
      tiers: {
        opus: { provider: 'gemini', model: 'gemini-2.5-pro' },
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6' },
        haiku: { provider: 'agy', model: 'claude-haiku-4-5-20251001' },
      },
    });

    expect(result.success).toBe(true);

    const variants = listVariantsFromConfig();
    const expectedPath = path.join(tmpDir, 'composite-scoped.settings.json');
    expect(variants.scoped.settings).toBe(expectedPath);
    expect(result.settingsPath).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
  });
});

describe('saveCompositeVariantUnified', () => {
  let tmpDir: string;
  let originalCcsDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-composite-test-'));
    originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_DIR = tmpDir;

    // Create unified config file
    const configPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants: {}
`,
      'utf-8'
    );
  });

  afterEach(() => {
    if (originalCcsDir !== undefined) {
      process.env.CCS_DIR = originalCcsDir;
    } else {
      delete process.env.CCS_DIR;
    }

    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should save composite variant to unified config', () => {
    const config: CompositeVariantConfig = {
      type: 'composite',
      default_tier: 'sonnet',
      tiers: {
        opus: { provider: 'gemini', model: 'gemini-3-pro-preview' },
        sonnet: { provider: 'agy', model: 'claude-sonnet-4-6' },
        haiku: { provider: 'agy', model: 'claude-haiku-4-5-20251001' },
      },
      settings: 'cliproxy/composite-test.settings.json',
      port: 8318,
    };

    saveCompositeVariantUnified('test', config);

    const variants = listVariantsFromConfig();
    expect(variants.test).toBeDefined();
    expect(variants.test.type).toBe('composite');
    expect(variants.test.default_tier).toBe('sonnet');
    expect(variants.test.tiers?.opus.model).toBe('gemini-3-pro-preview');
  });
});

describe('listVariantsFromConfig - composite variants', () => {
  let tmpDir: string;
  let originalCcsDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-composite-test-'));
    originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_DIR = tmpDir;
  });

  afterEach(() => {
    if (originalCcsDir !== undefined) {
      process.env.CCS_DIR = originalCcsDir;
    } else {
      delete process.env.CCS_DIR;
    }

    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should list composite variants with fallback field', () => {
    // Create unified config with composite variant that has fallback
    const configPath = path.join(tmpDir, 'config.yaml');
    const yamlContent = `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants:
    test:
      type: composite
      default_tier: sonnet
      tiers:
        opus:
          provider: agy
          model: claude-opus-4-6-thinking
          fallback:
            provider: gemini
            model: gemini-3-pro-preview
        sonnet:
          provider: agy
          model: claude-sonnet-4-6
        haiku:
          provider: agy
          model: claude-haiku-4-5-20251001
      settings: cliproxy/composite-test.settings.json
      port: 8318
`;
    fs.writeFileSync(configPath, yamlContent, 'utf-8');

    const variants = listVariantsFromConfig();
    expect(variants.test).toBeDefined();
    expect(variants.test.hasFallback).toBe(true);
  });

  it('should list composite variants with thinking field', () => {
    // Create unified config with composite variant that has per-tier thinking
    const configPath = path.join(tmpDir, 'config.yaml');
    const yamlContent = `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants:
    test:
      type: composite
      default_tier: sonnet
      tiers:
        opus:
          provider: agy
          model: claude-opus-4-6-thinking
          thinking: xhigh
        sonnet:
          provider: agy
          model: claude-sonnet-4-6
          thinking: medium
        haiku:
          provider: agy
          model: claude-haiku-4-5-20251001
          thinking: off
      settings: cliproxy/composite-test.settings.json
      port: 8318
`;
    fs.writeFileSync(configPath, yamlContent, 'utf-8');

    const variants = listVariantsFromConfig();
    expect(variants.test).toBeDefined();
    expect(variants.test.tiers?.opus.thinking).toBe('xhigh');
    expect(variants.test.tiers?.sonnet.thinking).toBe('medium');
    expect(variants.test.tiers?.haiku.thinking).toBe('off');
  });

  it('should have hasFallback=false when no fallbacks configured', () => {
    // Create unified config with composite variant WITHOUT fallback
    const configPath = path.join(tmpDir, 'config.yaml');
    const yamlContent = `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants:
    test:
      type: composite
      default_tier: sonnet
      tiers:
        opus:
          provider: agy
          model: claude-opus-4-6-thinking
        sonnet:
          provider: agy
          model: claude-sonnet-4-6
        haiku:
          provider: agy
          model: claude-haiku-4-5-20251001
      settings: cliproxy/composite-test.settings.json
      port: 8318
`;
    fs.writeFileSync(configPath, yamlContent, 'utf-8');

    const variants = listVariantsFromConfig();
    expect(variants.test).toBeDefined();
    expect(variants.test.hasFallback).toBe(false);
  });

  it('should skip malformed composite variant and keep valid variants', () => {
    const configPath = path.join(tmpDir, 'config.yaml');
    const yamlContent = `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants:
    bad:
      type: composite
      default_tier: sonnet
      tiers:
        opus:
          provider: agy
          model: claude-opus-4-6-thinking
        sonnet:
          provider: agy
          model: claude-sonnet-4-6
      settings: cliproxy/bad.settings.json
      port: 8318
    good:
      provider: gemini
      settings: cliproxy/good.settings.json
      port: 8319
`;
    fs.writeFileSync(configPath, yamlContent, 'utf-8');

    const variants = listVariantsFromConfig();
    expect(variants.bad).toBeUndefined();
    expect(variants.good).toBeDefined();
    expect(variants.good.provider).toBe('gemini');
  });
});
