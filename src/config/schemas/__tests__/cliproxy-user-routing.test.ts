import { describe, expect, it } from 'bun:test';
import * as yaml from 'js-yaml';
import { mergeWithDefaults } from '../../loader/defaults-merger';
import { generateYamlWithComments } from '../../loader/yaml-serializer';
import type { UnifiedConfig } from '../unified-config';
import { DEFAULT_CLIPROXY_SERVER_CONFIG } from '../proxy-server';

describe('CLIProxy user routing schema', () => {
  it('survives default merging and YAML serialization', () => {
    const configuredRouting = {
      oauth_model_alias: {
        codex: [
          {
            name: 'gpt-5.6-sol',
            alias: 'gpt-5.6-sol-fast',
            fork: true,
          },
        ],
      },
      payload: {
        override: [
          {
            models: [{ name: 'gpt-5.6-sol-fast', protocol: 'codex' }],
            params: { service_tier: 'priority' },
          },
        ],
      },
    };
    const merged = mergeWithDefaults({
      version: 14,
      cliproxy: configuredRouting,
    } as Partial<UnifiedConfig>);
    const serialized = yaml.load(generateYamlWithComments(merged)) as UnifiedConfig;

    expect(serialized.cliproxy.oauth_model_alias).toEqual(configuredRouting.oauth_model_alias);
    expect(serialized.cliproxy.payload).toEqual(configuredRouting.payload);
  });

  it('materializes canonical server defaults unless explicitly overridden', () => {
    const omitted = mergeWithDefaults({ version: 14 });
    expect(omitted.cliproxy_server?.management_timeout_ms).toBe(
      DEFAULT_CLIPROXY_SERVER_CONFIG.management_timeout_ms
    );
    expect(omitted.cliproxy_server?.remote.allow_self_signed).toBe(
      DEFAULT_CLIPROXY_SERVER_CONFIG.remote.allow_self_signed
    );

    const configured = mergeWithDefaults({
      version: 14,
      cliproxy_server: {
        management_timeout_ms: 2_000,
        remote: {
          allow_self_signed: true,
        },
      },
    });
    expect(configured.cliproxy_server?.management_timeout_ms).toBe(2_000);
    expect(configured.cliproxy_server?.remote.allow_self_signed).toBe(true);
  });
});
