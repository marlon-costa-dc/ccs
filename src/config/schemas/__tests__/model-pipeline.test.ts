import { describe, expect, it } from 'bun:test';
import { generateYamlWithComments } from '../../loader/yaml-serializer';
import fixture from './fixtures/model-pipeline-snapshot-v1.json';
import { MODEL_PIPELINE_SCHEMA_VERSION, parseModelPipelineConfig } from '../model-pipeline';
import { createEmptyUnifiedConfig, isUnifiedConfig } from '../unified-config';

function cloneEnvelope(): Record<string, unknown> {
  return structuredClone(fixture.model_pipeline) as unknown as Record<string, unknown>;
}

function snapshotOf(envelope: Record<string, unknown>): Record<string, unknown> {
  return envelope.snapshot as Record<string, unknown>;
}

describe('model pipeline config boundary', () => {
  it('accepts and deeply freezes the exact AI Hub v1 fixture', () => {
    const parsed = parseModelPipelineConfig(fixture.model_pipeline);

    expect(parsed.schema_version).toBe(MODEL_PIPELINE_SCHEMA_VERSION);
    expect(parsed.snapshot.generation).toBe(42);
    expect(parsed.snapshot.projection_digest).toBe(
      'sha256:a2d543504bba7caa9a5c925bb1018e484a0331fb0479dbc87e828db51bc275a5'
    );
    expect(parsed.snapshot.snapshot_digest).toBe(
      'sha256:15303dbab83d64d09f79f1f3a22bc09fb3ad5916f2624283f2c6a0ecbe969801'
    );
    expect(parsed.snapshot.agent_bindings).toEqual([
      { agent: 'codex', tier_id: 'primary', alias: 'aihub-primary' },
    ]);
    expect(parsed.snapshot.assignments[0]?.candidates[0]?.pricing?.entries).toHaveLength(9);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot.inventory.models[0]?.routes[0]?.credentials)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot.assignments[0]?.candidates[0]?.pricing?.entries)).toBe(
      true
    );
  });

  it('requires positive publication ownership values and rejects extra keys', () => {
    const invalidCases: ReadonlyArray<readonly [string, unknown, string]> = [
      ['request_timeout_seconds', undefined, 'must be a whole number 1 or greater'],
      ['request_timeout_seconds', 0, 'must be a whole number 1 or greater'],
      ['request_timeout_seconds', '120', 'must be a whole number 1 or greater'],
      ['retained_snapshots', undefined, 'must be a whole number 1 or greater'],
      ['retained_snapshots', 0, 'must be a whole number 1 or greater'],
      ['retained_snapshots', 2.5, 'must be a whole number 1 or greater'],
      ['legacy_atomic_write', true, 'is not part of schema version 1'],
    ];

    for (const [key, value, message] of invalidCases) {
      const envelope = cloneEnvelope();
      const publication = snapshotOf(envelope).publication as Record<string, unknown>;
      if (value === undefined) {
        delete publication[key];
      } else {
        publication[key] = value;
      }
      expect(() => parseModelPipelineConfig(envelope)).toThrow(message);
    }
  });

  it('rejects fields outside the exact versioned contract', () => {
    const envelope = cloneEnvelope();
    snapshotOf(envelope).legacy_models = [];

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.legacy_models is not part of schema version 1'
    );
  });

  it('rejects numeric prices because pricing is lossless decimal text', () => {
    const envelope = cloneEnvelope();
    const assignments = snapshotOf(envelope).assignments as Array<Record<string, unknown>>;
    const candidates = assignments[0]?.candidates as Array<Record<string, unknown>>;
    const pricing = candidates[0]?.pricing as Record<string, unknown>;
    const entries = pricing.entries as Array<Record<string, unknown>>;
    entries[0]!.amount = 0.25;

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.assignments[0].candidates[0].pricing.entries[0].amount'
    );
  });

  it('rejects variants serialized as independent catalog models', () => {
    const envelope = cloneEnvelope();
    const catalog = snapshotOf(envelope).catalog as Array<Record<string, unknown>>;
    catalog[0]!.variant_id = 'high';

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.catalog[0].variant_id is not part of schema version 1'
    );
  });

  it('rejects one ModelKey assigned to more than one exclusive tier', () => {
    const envelope = cloneEnvelope();
    const snapshot = snapshotOf(envelope);
    const assignments = snapshot.assignments as Array<Record<string, unknown>>;
    const evaluations = snapshot.evaluations as Array<Record<string, unknown>>;
    const fastAssignment = structuredClone(assignments[0]!);
    fastAssignment.tier_id = 'fast';
    fastAssignment.alias = 'aihub-fast';
    const fastEvaluation = structuredClone(evaluations[0]!);
    fastEvaluation.tier_id = 'fast';
    assignments.unshift(fastAssignment);
    evaluations.unshift(fastEvaluation);

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.assignments assigns one ModelKey to more than one tier'
    );
  });

  it('rejects missing, duplicate, or dangling agent tier bindings', () => {
    const missing = cloneEnvelope();
    snapshotOf(missing).agent_bindings = [];
    expect(() => parseModelPipelineConfig(missing)).toThrow(
      'model_pipeline.snapshot.agent_bindings must contain at least one agent tier binding'
    );

    const duplicate = cloneEnvelope();
    snapshotOf(duplicate).agent_bindings = [
      { agent: 'codex', tier_id: 'primary', alias: 'aihub-primary' },
      { agent: 'codex', tier_id: 'primary', alias: 'aihub-primary' },
    ];
    expect(() => parseModelPipelineConfig(duplicate)).toThrow(
      'model_pipeline.snapshot.agent_bindings must be unique and sorted'
    );

    const dangling = cloneEnvelope();
    snapshotOf(dangling).agent_bindings = [
      { agent: 'codex', tier_id: 'primary', alias: 'aihub-fast' },
    ];
    expect(() => parseModelPipelineConfig(dangling)).toThrow(
      'model_pipeline.snapshot.agent_bindings must reference the alias allocated to each bound tier'
    );
  });

  it('rejects semantic drift when the projection digest is stale', () => {
    const envelope = cloneEnvelope();
    snapshotOf(envelope).generated_at = '2026-08-27T19:00:00Z';

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.projection_digest must equal sha256:'
    );
  });

  it('accepts only explicit classified candidate failover invariants', () => {
    const invalidCases: ReadonlyArray<readonly [string, unknown, string]> = [
      ['mode', 'retry', 'must equal classified_candidate_failover'],
      ['automatic_retry', true, 'must be false'],
      ['automatic_failover', false, 'must be true'],
      ['max_candidate_attempts', 1, 'must be a whole number 2 or greater'],
      ['serve_stale_on_error', true, 'must be false'],
      ['preserve_first_error', false, 'must be true'],
      ['terminate_owned_request_on_cancel', false, 'must be true'],
    ];

    for (const [key, value, message] of invalidCases) {
      const envelope = cloneEnvelope();
      const failurePolicy = snapshotOf(envelope).failure_policy as Record<string, unknown>;
      failurePolicy[key] = value;
      expect(() => parseModelPipelineConfig(envelope)).toThrow(message);
    }
  });

  it('rejects empty, duplicate, overlapping, unsorted, and unknown failover matchers', () => {
    const mutateRules = (
      mutate: (rules: Array<Record<string, unknown>>) => void,
      message: string
    ) => {
      const envelope = cloneEnvelope();
      const failurePolicy = snapshotOf(envelope).failure_policy as Record<string, unknown>;
      const rules = failurePolicy.failover_rules as Array<Record<string, unknown>>;
      mutate(rules);
      expect(() => parseModelPipelineConfig(envelope)).toThrow(message);
    };

    mutateRules((rules) => rules.splice(0), 'must contain at least one rule');
    mutateRules((rules) => {
      rules[0]!.http_statuses = [];
      rules[0]!.error_codes = [];
      rules[0]!.failure_kinds = [];
    }, 'must declare at least one matcher');
    mutateRules((rules) => {
      rules[1]!.rule_id = rules[0]!.rule_id;
    }, 'must contain unique rule ids');
    mutateRules((rules) => {
      rules[1]!.http_statuses = [429, 503];
    }, 'http_statuses matchers must belong to exactly one rule');
    mutateRules((rules) => {
      rules[1]!.http_statuses = [503, 500];
    }, 'must be unique and sorted');
    mutateRules((rules) => {
      rules[0]!.failure_kinds = ['invented'];
    }, 'must be a supported failure kind');
    mutateRules((rules) => {
      rules[0]!.legacy_retry_count = 2;
    }, 'is not part of schema version 1');
  });

  it('validates and serializes model_pipeline as a native top-level CCS section', () => {
    const modelPipeline = parseModelPipelineConfig(fixture.model_pipeline);
    const config = { ...createEmptyUnifiedConfig(), model_pipeline: modelPipeline };

    expect(isUnifiedConfig(config)).toBe(true);
    const serialized = generateYamlWithComments(config);
    expect(serialized).toContain('\nmodel_pipeline:\n');
    expect(serialized).toContain(
      'snapshot_digest: sha256:15303dbab83d64d09f79f1f3a22bc09fb3ad5916f2624283f2c6a0ecbe969801'
    );
    expect(serialized.indexOf('\nmodel_pipeline:\n')).toBeLessThan(
      serialized.indexOf('\ncliproxy_server:\n')
    );

    const invalid = {
      ...config,
      model_pipeline: { schema_version: 2, snapshot: modelPipeline.snapshot },
    };
    expect(isUnifiedConfig(invalid)).toBe(false);
  });
});
