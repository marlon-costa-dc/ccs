import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createSettingsFile,
  updateSettingsFile,
} from '../../../src/web-server/routes/route-helpers';

describe('route-helpers AGY denylist', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-route-helpers-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('rejects denylisted AGY models on settings create', () => {
    expect(() =>
      createSettingsFile('agy-denied', 'http://127.0.0.1:8317/api/provider/agy', 'test-token', {
        model: 'claude-sonnet-4.5',
        opusModel: 'claude-opus-4.5',
        sonnetModel: 'claude-sonnet-4.5',
        haikuModel: 'claude-haiku-4.5',
      })
    ).toThrow(/denylist/i);
  });

  it('rejects denylisted AGY models on settings update', () => {
    const settingsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'agy-profile.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
            ANTHROPIC_MODEL: 'claude-sonnet-4-6',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5',
          },
        },
        null,
        2
      ) + '\n'
    );

    expect(() => updateSettingsFile('agy-profile', { model: 'claude-opus-4.5' })).toThrow(
      /denylist/i
    );
  });

  it('keeps AGY denylist enforcement when CCS_DROID_PROVIDER is present', () => {
    const settingsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'agy-profile.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
            ANTHROPIC_MODEL: 'claude-sonnet-4-6',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5',
            CCS_DROID_PROVIDER: 'anthropic',
          },
        },
        null,
        2
      ) + '\n'
    );

    expect(() => updateSettingsFile('agy-profile', { model: 'claude-sonnet-4.5' })).toThrow(
      /denylist/i
    );
  });

  it('canonicalizes legacy iflow model IDs on settings create', () => {
    createSettingsFile('iflow-profile', 'http://127.0.0.1:8317/api/provider/iflow', 'test-token', {
      model: 'kimi-k2.5',
      opusModel: 'iflow-default',
      sonnetModel: 'deepseek-v3.2-chat',
      haikuModel: 'glm-4.7',
    });

    const settingsPath = path.join(tempHome, '.ccs', 'iflow-profile.settings.json');
    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };

    expect(persisted.env.ANTHROPIC_MODEL).toBe('kimi-k2');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen3-coder-plus');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('deepseek-v3.2');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.6');
  });

  it('canonicalizes legacy iflow model IDs on settings create with root URL + provider hint', () => {
    createSettingsFile(
      'iflow-profile-root',
      'http://127.0.0.1:8317',
      'test-token',
      {
        model: 'kimi-k2.5',
        opusModel: 'iflow-default',
        sonnetModel: 'deepseek-v3.2-chat',
        haikuModel: 'glm-4.7',
      },
      'iflow'
    );

    const settingsPath = path.join(tempHome, '.ccs', 'iflow-profile-root.settings.json');
    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };

    expect(persisted.env.ANTHROPIC_MODEL).toBe('kimi-k2');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen3-coder-plus');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('deepseek-v3.2');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.6');
  });

  it('canonicalizes legacy iflow model IDs on settings update', () => {
    const settingsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'iflow-profile.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/iflow',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
            ANTHROPIC_MODEL: 'qwen3-coder-plus',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3-coder-plus',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3-coder-plus',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3-coder-plus',
          },
        },
        null,
        2
      ) + '\n'
    );

    updateSettingsFile('iflow-profile', {
      model: 'kimi-k2.5',
      sonnetModel: 'deepseek-v3.2-chat',
      haikuModel: 'minimax-m2.5',
    });

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('kimi-k2');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('deepseek-v3.2');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('qwen3-coder-plus');
  });

  it('canonicalizes legacy iflow model IDs on settings update with root URL + provider hint', () => {
    const settingsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'iflow-root.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
            ANTHROPIC_MODEL: 'qwen3-coder-plus',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3-coder-plus',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3-coder-plus',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3-coder-plus',
          },
        },
        null,
        2
      ) + '\n'
    );

    updateSettingsFile('iflow-root', {
      model: 'kimi-k2.5',
      sonnetModel: 'deepseek-v3.2-chat',
      haikuModel: 'minimax-m2.5',
      provider: 'iflow',
    });

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('kimi-k2');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('deepseek-v3.2');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('qwen3-coder-plus');
  });

  it('creates native Anthropic settings without base URL', () => {
    createSettingsFile('anthropic-direct', '', 'sk-ant-api03-test', {
      model: 'claude-sonnet-4-5-20250929',
    });

    const settingsPath = path.join(tempHome, '.ccs', 'anthropic-direct.settings.json');
    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };

    expect(persisted.env.ANTHROPIC_API_KEY).toBe('sk-ant-api03-test');
    expect(persisted.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(persisted.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  it('switches proxy settings to native Anthropic mode on update', () => {
    const settingsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'anthropic-update.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'proxy-token',
            ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
          },
        },
        null,
        2
      ) + '\n'
    );

    updateSettingsFile('anthropic-update', {
      baseUrl: '',
      apiKey: 'sk-ant-api03-test',
    });

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };

    expect(persisted.env.ANTHROPIC_API_KEY).toBe('sk-ant-api03-test');
    expect(persisted.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(persisted.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });
});
