import { describe, expect, it } from 'bun:test';
import { modelPipelineConfigFixture } from '../../../config/schemas/__tests__/fixtures/model-pipeline-v2-fixture';
import {
  parseModelPipelineConfig,
  type ModelPipelineSnapshot,
} from '../../../config/schemas/model-pipeline';
import { createEmptyUnifiedConfig } from '../../../config/schemas/unified-config';
import { generateYamlWithComments } from '../../../config/loader/yaml-serializer';
import { ConfigError } from '../../../errors/error-types';
import { renderUnifiedConfigForPublication } from '../generator';
import {
  computeProjectionDigest,
  projectModelRouting,
  projectModelRoutingPayload,
} from '../model-routing-projector';

function snapshot(): ModelPipelineSnapshot {
  return parseModelPipelineConfig(modelPipelineConfigFixture()).snapshot;
}

describe('model-routing v2 projector', () => {
  it('translates nested keys, ordered members, candidates, direct routes, and failure policy', () => {
    const source = snapshot();
    const projected = projectModelRouting(source);
    const alias = projected.aliases[0]!;
    const member = alias.members[0]!;
    const candidate = member.candidates[0]!;
    const directModel = projected['direct-models'][0]!;
    const directRoute = directModel.routes[0]!;

    expect(Object.keys(projected)).toEqual([
      'schema-version',
      'generation',
      'snapshot-digest',
      'aliases',
      'direct-models',
      'failure-policy',
      'projection-digest',
    ]);
    expect(projected.generation).toBe(1);
    expect(projected['snapshot-digest']).toBe(source.snapshot_digest);
    expect(alias).toMatchObject({ name: 'aihub-deep', 'tier-id': 'deep', selectable: true });
    expect(member).toMatchObject({
      'model-key': {
        'catalog-provider-id': 'openai',
        'canonical-model-id': 'gpt-5.4-pro',
      },
      'member-rank': 1,
      'model-score': '0.906250',
    });
    expect(candidate).toMatchObject({
      'route-key': {
        'model-key': {
          'catalog-provider-id': 'openai',
          'canonical-model-id': 'gpt-5.4-pro',
        },
        'route-channel': 'runtime-failing',
      },
      'catalog-route-provider-id': 'openai',
      'catalog-route-model-id': 'gpt-5.4-pro',
      'runtime-model-id': 'gpt-5.4-pro',
      'variant-id': null,
      'route-rank': 1,
      'quota-domains': ['runtime-failing'],
      protocols: ['openai_chat'],
      health: {
        status: 'healthy',
        selectable: true,
        'latency-ms': null,
      },
    });
    expect(candidate.pricing?.entries[0]).toEqual({
      name: 'input',
      amount: '30',
      'tier-type': null,
      'tier-size': null,
      'context-key': null,
    });
    expect(directModel['model-key']).toEqual(member['model-key']);
    expect(directRoute['route-key']).toEqual(candidate['route-key']);
    expect(projected['failure-policy']).toMatchObject({
      mode: 'classified_candidate_failover',
      'automatic-retry': false,
      'automatic-failover': true,
      'max-candidate-attempts': 3,
      'serve-stale-on-error': false,
      'preserve-first-error': true,
      'terminate-owned-request-on-cancel': true,
    });
    expect('pricing' in projected).toBe(false);
  });

  it('preserves an AI Hub-selected credential subset while direct routes retain inventory', () => {
    const changed = structuredClone(snapshot()) as unknown as Record<string, unknown>;
    const inventory = changed.inventory as Record<string, unknown>;
    const models = inventory.direct_models as Array<Record<string, unknown>>;
    const routes = models[0]?.routes as Array<Record<string, unknown>>;
    const credentials = routes[0]?.credentials as Array<Record<string, unknown>>;
    const second = structuredClone(credentials[0]!);
    second.credential_ref = { id: `sha256:${'d'.repeat(64)}`, kind: 'api_key' };
    second.quota_domain = 'runtime-failing-secondary';
    credentials.push(second);

    const projected = projectModelRouting(changed as unknown as ModelPipelineSnapshot);
    expect(projected.aliases[0]?.members[0]?.candidates[0]?.['credential-refs']).toHaveLength(1);
    expect(projected['direct-models'][0]?.routes[0]?.['credential-refs']).toHaveLength(2);
  });

  it('uses only sourced selectability for direct route publication', () => {
    const changed = structuredClone(snapshot()) as unknown as Record<string, unknown>;
    const inventory = changed.inventory as Record<string, unknown>;
    const models = inventory.direct_models as Array<Record<string, unknown>>;
    const routes = models[0]?.routes as Array<Record<string, unknown>>;
    for (const route of routes) route.selectable = false;

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
    const inventory = changed.inventory as Record<string, unknown>;
    const models = inventory.direct_models as Array<Record<string, unknown>>;
    const modelKey = models[0]!.model_key;
    models[0]!.variants = [
      {
        variant_key: { model_key: modelKey, variant_id: 'invented' },
        display_name: 'Invented',
        protocols: ['openai_chat'],
      },
    ];

    expect(() => projectModelRouting(changed as unknown as ModelPipelineSnapshot)).toThrow(
      'has no matching catalog variant'
    );
  });

  it('owns one acyclic projection digest over the payload without its digest field', () => {
    const source = snapshot();
    const payload = projectModelRoutingPayload(source);
    const projected = projectModelRouting(source);

    expect('projection-digest' in payload).toBe(false);
    expect(projected['projection-digest']).toBe(computeProjectionDigest(payload));
    expect(projected['projection-digest']).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('renders complete config without legacy routing, retry, or alias coexistence', () => {
    const source = snapshot();
    const activeConfigYaml = generateYamlWithComments(createEmptyUnifiedConfig());
    const serialized = renderUnifiedConfigForPublication(activeConfigYaml, source);

    expect(serialized).toContain('\nmodel-routing:\n');
    expect(serialized).not.toContain('\noauth-model-alias:\n');
    expect(serialized).not.toContain('\nrequest-retry:');
    expect(serialized).not.toContain('\nmax-retry-interval:');
    expect(serialized).not.toContain('\nquota-exceeded:\n');
    expect(serialized).not.toContain('\ndisable-cooling:');
    expect(serialized).not.toMatch(/\nrouting:\n/);
  });
});
