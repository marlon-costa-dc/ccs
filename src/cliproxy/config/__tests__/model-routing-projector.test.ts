import { describe, expect, it } from 'bun:test';
import * as yaml from 'js-yaml';
import fixture from '../../../config/schemas/__tests__/fixtures/model-pipeline-snapshot-v1.json';
import {
  parseModelPipelineConfig,
  type ModelPipelineSnapshot,
} from '../../../config/schemas/model-pipeline';
import { ConfigError } from '../../../errors/error-types';
import { createEmptyUnifiedConfig } from '../../../config/schemas/unified-config';
import { renderUnifiedConfigForPublication } from '../generator';
import { projectModelRouting, serializeModelRoutingSection } from '../model-routing-projector';

function snapshot(): ModelPipelineSnapshot {
  return parseModelPipelineConfig(fixture.model_pipeline).snapshot;
}

describe('model-routing projector', () => {
  it('translates every frozen v1 field without selecting or recalculating', () => {
    const projected = projectModelRouting(snapshot());
    const alias = projected.aliases[0]!;
    const candidate = alias.candidates[0]!;
    const directModel = projected['direct-models'][0]!;
    const directRoute = directModel.routes[0]!;

    expect(Object.keys(projected)).toEqual([
      'schema-version',
      'generation',
      'snapshot-digest',
      'projection-digest',
      'aliases',
      'direct-models',
      'failure-policy',
    ]);
    expect(projected.generation).toBe(42);
    expect(projected['snapshot-digest']).toBe(
      'sha256:15303dbab83d64d09f79f1f3a22bc09fb3ad5916f2624283f2c6a0ecbe969801'
    );
    expect(projected['projection-digest']).toBe(
      'sha256:a2d543504bba7caa9a5c925bb1018e484a0331fb0479dbc87e828db51bc275a5'
    );
    expect(alias).toMatchObject({
      name: 'aihub-primary',
      'tier-id': 'primary',
      selectable: true,
      reason: 'global allocator selected one exclusive model',
    });
    expect(Object.keys(candidate)).toEqual([
      'model-key',
      'route-channel',
      'catalog-route-provider-id',
      'catalog-route-model-id',
      'runtime-model-id',
      'route-selector',
      'variant-id',
      'rank',
      'quota-domains',
      'credential-refs',
      'protocols',
      'health',
      'restrictions',
      'pricing',
      'selection-reason',
    ]);
    expect(candidate).toMatchObject({
      'model-key': {
        'catalog-provider-id': 'openai',
        'canonical-model-id': 'gpt-5.4',
      },
      'route-channel': 'openai',
      'catalog-route-provider-id': 'openrouter',
      'catalog-route-model-id': 'openai/gpt-5.4',
      'runtime-model-id': 'gpt-5.4',
      'route-selector': `sha256:${'7'.repeat(64)}`,
      'variant-id': null,
      rank: 1,
      'quota-domains': ['openai-primary', 'openai-secondary'],
      protocols: ['openai_chat'],
      health: {
        status: 'healthy',
        selectable: true,
        'observed-at': '2026-08-27T18:45:00Z',
        'latency-ms': 137,
      },
      restrictions: [],
      'selection-reason': 'highest globally exclusive eligible score',
    });
    expect(candidate['credential-refs']).toEqual([
      { id: `sha256:${'5'.repeat(64)}`, kind: 'oauth' },
      { id: `sha256:${'6'.repeat(64)}`, kind: 'api_key' },
    ]);
    expect(candidate.pricing?.entries).toHaveLength(9);
    expect(candidate.pricing?.entries[3]).toEqual({
      name: 'cache_read',
      amount: '0.5',
      'tier-type': 'context',
      'tier-size': 272000,
      'context-key': null,
    });
    expect(candidate.pricing?.entries[8]).toEqual({
      name: 'output',
      amount: '22.5',
      'tier-type': null,
      'tier-size': null,
      'context-key': 'context_over_200k',
    });

    expect(Object.keys(directModel)).toEqual([
      'model-key',
      'display-name',
      'active',
      'variants',
      'routes',
    ]);
    expect(directModel.variants).toEqual([
      {
        'variant-key': {
          'catalog-provider-id': 'openai',
          'canonical-model-id': 'gpt-5.4',
          'variant-id': 'high',
        },
        'display-name': 'High reasoning',
        'reasoning-option': 'high',
        protocols: ['openai_chat'],
      },
    ]);
    expect(Object.keys(directRoute)).toEqual([
      'route-key',
      'catalog-route-provider-id',
      'catalog-route-model-id',
      'runtime-model-id',
      'route-selector',
      'quota-domains',
      'credential-refs',
      'protocols',
      'restrictions',
      'health',
      'pricing',
      'selectable',
      'selection-reason',
    ]);
    expect(directRoute.pricing).toEqual(candidate.pricing);
    expect(projected['failure-policy']).toEqual({
      mode: 'classified_candidate_failover',
      'credential-acquisition-timeout-seconds': 120,
      'automatic-retry': false,
      'automatic-failover': true,
      'max-candidate-attempts': 3,
      'failover-rules': [
        {
          'rule-id': 'capacity',
          'http-statuses': [429],
          'error-codes': ['credential_concurrency_exceeded', 'model_cooldown', 'rate_limit'],
          'failure-kinds': ['credential'],
        },
        {
          'rule-id': 'pre-response-transient',
          'http-statuses': [408, 500, 502, 503, 504],
          'error-codes': [
            'empty_completion',
            'empty_stream',
            'home_unavailable',
            'upstream_failed',
          ],
          'failure-kinds': ['empty_pre_response', 'transport', 'upstream_timeout'],
        },
      ],
      'serve-stale-on-error': false,
      'preserve-first-error': true,
      'terminate-owned-request-on-cancel': true,
    });
    expect('pricing' in projected).toBe(false);
  });

  it('preserves an AI Hub-selected credential subset while direct routes retain inventory', () => {
    const changed = structuredClone(snapshot()) as unknown as Record<string, unknown>;
    const assignments = changed.assignments as Array<Record<string, unknown>>;
    const candidates = assignments[0]?.candidates as Array<Record<string, unknown>>;
    candidates[0]!.quota_domains = ['openai-primary'];
    candidates[0]!.credential_refs = [{ id: `sha256:${'5'.repeat(64)}`, kind: 'oauth' }];

    const projected = projectModelRouting(changed as unknown as ModelPipelineSnapshot);
    expect(projected.aliases[0]?.candidates[0]?.['credential-refs']).toHaveLength(1);
    expect(projected['direct-models'][0]?.routes[0]?.['credential-refs']).toHaveLength(2);
  });

  it('uses only the snapshot selectable flag for direct route publication', () => {
    const changed = structuredClone(snapshot()) as unknown as Record<string, unknown>;
    const inventory = changed.inventory as Record<string, unknown>;
    const models = inventory.models as Array<Record<string, unknown>>;
    const routes = models[0]?.routes as Array<Record<string, unknown>>;
    routes[0]!.selectable = false;

    expect(
      projectModelRouting(changed as unknown as ModelPipelineSnapshot)['direct-models']
    ).toEqual([]);
  });

  it('fails closed when a selectable route has no matching catalog route', () => {
    const changed = structuredClone(snapshot()) as unknown as Record<string, unknown>;
    const catalog = changed.catalog as Array<Record<string, unknown>>;
    catalog[0]!.routes = [];

    expect(() => projectModelRouting(changed as unknown as ModelPipelineSnapshot)).toThrow(
      ConfigError
    );
    expect(() => projectModelRouting(changed as unknown as ModelPipelineSnapshot)).toThrow(
      'has no matching catalog route'
    );
  });

  it('fails closed when an inventory variant has no catalog-owned reasoning option', () => {
    const changed = structuredClone(snapshot()) as unknown as Record<string, unknown>;
    const catalog = changed.catalog as Array<Record<string, unknown>>;
    catalog[0]!.variants = [];

    expect(() => projectModelRouting(changed as unknown as ModelPipelineSnapshot)).toThrow(
      'has no matching catalog variant'
    );
  });

  it('serializes only raw canonical model-routing YAML with null pointers intact', () => {
    const serialized = serializeModelRoutingSection(snapshot());
    const parsed = yaml.load(serialized) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual(['model-routing']);
    expect(serialized).toContain('snapshot-digest: sha256:');
    expect(serialized).toContain('variant-id: null');
    expect(serialized).toContain("amount: '0.25'");
    expect(serialized).not.toContain('&ref_');
    expect(serialized).not.toContain('*ref_');
    expect(serialized).not.toContain('model-pricing:');
  });

  it('renders a complete config without legacy routing, retry or alias coexistence', () => {
    const modelPipeline = parseModelPipelineConfig(fixture.model_pipeline);
    const config = { ...createEmptyUnifiedConfig(), model_pipeline: modelPipeline };

    const serialized = renderUnifiedConfigForPublication(config, 8317);

    expect(serialized).toContain('\nmodel-routing:\n');
    expect(serialized).not.toContain('\noauth-model-alias:\n');
    expect(serialized).not.toContain('\nrequest-retry:');
    expect(serialized).not.toContain('\nmax-retry-interval:');
    expect(serialized).not.toContain('\nquota-exceeded:\n');
    expect(serialized).not.toContain('\ndisable-cooling:');
    expect(serialized).not.toMatch(/\nrouting:\n/);
  });
});
