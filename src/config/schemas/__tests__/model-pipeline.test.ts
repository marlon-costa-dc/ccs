import { describe, expect, it } from 'bun:test';
import { MODEL_PIPELINE_SCHEMA_VERSION, parseModelPipelineConfig } from '../model-pipeline';
import { createEmptyUnifiedConfig, isUnifiedConfig } from '../unified-config';
import { generateYamlWithComments } from '../../loader/yaml-serializer';

function createCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    catalog_provider_id: 'openai',
    canonical_model_id: 'gpt-5.4',
    route_channel: 'codex',
    variant_id: 'high',
    quota_domain: 'openai-team-a',
    protocols: ['openai', 'anthropic'],
    health: {
      status: 'healthy',
      latency_ms: 125.5,
    },
    restrictions: [],
    pricing: {
      currency: 'USD',
      source: 'models.dev',
      source_digest: 'sha256:catalog',
      fetched_at: '2026-08-27T16:00:00Z',
      input_per_million: '2.500000',
      output_per_million: '10.000000',
      cache_read_per_million: '0.250000',
      cache_write_per_million: null,
    },
    eligible: true,
    rejection_reasons: [],
    ...overrides,
  };
}

function createModelPipelineConfig(): Record<string, unknown> {
  return {
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    snapshot: {
      schema_version: 1,
      generation: 17,
      generated_at: '2026-08-27T16:00:00Z',
      source_digests: [{ source_id: 'models.dev', digest: 'sha256:catalog' }],
      inventory: { routes: [createCandidate()] },
      catalog: {
        models: [
          {
            catalog_provider_id: 'openai',
            canonical_model_id: 'gpt-5.4',
            variants: [{ variant_id: 'high' }],
          },
        ],
      },
      observations: [],
      evaluations: [],
      rejections: [],
      assignments: [
        {
          tier: 'deep',
          alias: 'aihub-deep',
          members: [createCandidate()],
          candidates: [createCandidate()],
        },
      ],
      retry_policy: {
        max_attempts: 2,
        cooldown_seconds: 30,
        rules: [{ status: 429, classifier: 'quota_exhausted', action: 'failover' }],
      },
      publication: {
        targets: ['ccs', 'cliproxy'],
        retention: { releases: 1 },
      },
      projection_digest: 'sha256:projection',
      snapshot_digest: 'sha256:snapshot',
    },
  };
}

describe('model pipeline config boundary', () => {
  it('accepts and freezes the complete AI Hub-owned snapshot', () => {
    const parsed = parseModelPipelineConfig(createModelPipelineConfig());

    expect(parsed.schema_version).toBe(MODEL_PIPELINE_SCHEMA_VERSION);
    expect(parsed.snapshot.generation).toBe(17);
    expect(parsed.snapshot.assignments[0]?.candidates[0]?.pricing.input_per_million).toBe(
      '2.500000'
    );
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot.assignments)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot.assignments[0]?.candidates)).toBe(true);
  });

  it('rejects numeric prices because decimal strings are the canonical contract', () => {
    const config = createModelPipelineConfig();
    const snapshot = config.snapshot as Record<string, unknown>;
    const assignments = snapshot.assignments as Array<Record<string, unknown>>;
    const candidates = assignments[0]?.candidates as Array<Record<string, unknown>>;
    const pricing = candidates[0]?.pricing as Record<string, unknown>;
    pricing.input_per_million = 2.5;

    expect(() => parseModelPipelineConfig(config)).toThrow(
      'model_pipeline.snapshot.assignments[0].candidates[0].pricing.input_per_million'
    );
  });

  it('rejects one canonical model assigned to more than one tier', () => {
    const config = createModelPipelineConfig();
    const snapshot = config.snapshot as Record<string, unknown>;
    const assignments = snapshot.assignments as Array<Record<string, unknown>>;
    assignments.push({
      tier: 'fast',
      alias: 'aihub-fast',
      members: [createCandidate({ route_channel: 'openai' })],
      candidates: [createCandidate({ route_channel: 'openai' })],
    });

    expect(() => parseModelPipelineConfig(config)).toThrow(
      'canonical model openai/gpt-5.4 is assigned to both deep and fast'
    );
  });

  it('rejects a selected member that is absent from the ordered candidate set', () => {
    const config = createModelPipelineConfig();
    const snapshot = config.snapshot as Record<string, unknown>;
    const assignments = snapshot.assignments as Array<Record<string, unknown>>;
    assignments[0] = {
      tier: 'deep',
      alias: 'aihub-deep',
      members: [createCandidate({ canonical_model_id: 'o3' })],
      candidates: [createCandidate()],
    };

    expect(() => parseModelPipelineConfig(config)).toThrow(
      'model_pipeline.snapshot.assignments[0].members[0] is not present in candidates'
    );
  });

  it('rejects variants serialized as independent catalog models', () => {
    const config = createModelPipelineConfig();
    const snapshot = config.snapshot as Record<string, unknown>;
    const catalog = snapshot.catalog as Record<string, unknown>;
    catalog.models = [
      {
        catalog_provider_id: 'openai',
        canonical_model_id: 'gpt-5.4-high',
        variant_id: 'high',
        variants: [],
      },
    ];

    expect(() => parseModelPipelineConfig(config)).toThrow(
      'model_pipeline.snapshot.catalog.models[0].variant_id is forbidden'
    );
  });

  it('rejects non-UTC generation timestamps and unsupported envelope versions', () => {
    const invalidTimestamp = createModelPipelineConfig();
    const timestampSnapshot = invalidTimestamp.snapshot as Record<string, unknown>;
    timestampSnapshot.generated_at = '2026-08-27T13:00:00-03:00';
    expect(() => parseModelPipelineConfig(invalidTimestamp)).toThrow(
      'model_pipeline.snapshot.generated_at'
    );

    const invalidVersion = createModelPipelineConfig();
    invalidVersion.schema_version = 2;
    expect(() => parseModelPipelineConfig(invalidVersion)).toThrow(
      'model_pipeline.schema_version must equal 1'
    );
  });

  it('validates and serializes model_pipeline as a native top-level CCS section', () => {
    const config = {
      ...createEmptyUnifiedConfig(),
      model_pipeline: parseModelPipelineConfig(createModelPipelineConfig()),
    };

    expect(isUnifiedConfig(config)).toBe(true);
    const yaml = generateYamlWithComments(config);
    expect(yaml).toContain('\nmodel_pipeline:\n');
    expect(yaml).toContain('snapshot_digest: sha256:snapshot');
    expect(yaml.indexOf('\nmodel_pipeline:\n')).toBeLessThan(yaml.indexOf('\ncliproxy_server:\n'));

    const invalid = {
      ...config,
      model_pipeline: { schema_version: 2, snapshot: config.model_pipeline.snapshot },
    };
    expect(isUnifiedConfig(invalid)).toBe(false);
  });
});
