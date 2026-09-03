import { describe, expect, it } from 'bun:test';
import { generateYamlWithComments } from '../../loader/yaml-serializer';
import {
  modelPipelineConfigFixture,
  modelPipelineRequestFixture,
  modelPipelineSnapshotFixture,
} from './fixtures/model-pipeline-v3-fixture';
import {
  MODEL_PIPELINE_SCHEMA_VERSION,
  parseModelPipelineConfig,
  parseModelPipelinePublicationRequest,
} from '../model-pipeline';
import { createEmptyUnifiedConfig, isUnifiedConfig } from '../unified-config';

function cloneEnvelope(): Record<string, unknown> {
  return modelPipelineConfigFixture();
}

function snapshotOf(envelope: Record<string, unknown>): Record<string, unknown> {
  return envelope.snapshot as Record<string, unknown>;
}

function firstCandidate(snapshot: Record<string, unknown>): Record<string, unknown> {
  const assignments = snapshot.assignments as Array<Record<string, unknown>>;
  const members = assignments[0]?.members as Array<Record<string, unknown>>;
  const candidates = members[0]?.candidates as Array<Record<string, unknown>>;
  return candidates[0]!;
}

describe('model pipeline v3 config boundary', () => {
  it('accepts and deeply freezes the canonical AI Hub v3 fixture', () => {
    const parsed = parseModelPipelineConfig(cloneEnvelope());

    expect(parsed.schema_version).toBe(MODEL_PIPELINE_SCHEMA_VERSION);
    expect(MODEL_PIPELINE_SCHEMA_VERSION).toBe(3);
    expect(parsed.snapshot.generation).toBe(1);
    expect(parsed.snapshot.snapshot_digest).toBe(
      'sha256:389c56156f91b78bb99776a1de99dfe9482ead661c6c2c8cac56c864972a6ca2'
    );
    // CLIProxy's own inventory/routing contract stays pinned at 2, independent
    // of the outer AI Hub <-> CCS snapshot schema version bump to 3.
    expect(parsed.snapshot.inventory.schema_version).toBe(2);
    expect(parsed.snapshot.inventory.routing_schema.version).toBe(2);
    expect(parsed.receipt.active.projection_digest).toBe(`sha256:${'b'.repeat(64)}`);
    expect(parsed.snapshot.agent_bindings).toEqual([
      { agent: 'architect', tier_id: 'balanced', alias: 'ai-hub-balanced' },
    ]);
    expect(parsed.snapshot.assignments[0]?.members[0]?.candidates).toHaveLength(2);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot)).toBe(true);
    expect(
      Object.isFrozen(parsed.snapshot.inventory.direct_models[0]?.routes[0]?.credentials)
    ).toBe(true);
    expect(Object.isFrozen(parsed.snapshot.catalog[0]?.provider_request?.body)).toBe(true);
  });

  it('accepts every configured lane and preserves its tier_id and alias unchanged', () => {
    const parsed = parseModelPipelineConfig(cloneEnvelope());
    const byTier = new Map(parsed.snapshot.assignments.map((item) => [item.tier_id, item]));

    expect([...byTier.keys()]).toEqual(['balanced', 'fast', 'frontier', 'most-capable']);
    expect(byTier.get('balanced')).toMatchObject({ alias: 'ai-hub-balanced', selectable: true });
    expect(byTier.get('fast')).toMatchObject({ alias: 'ai-hub-fast', selectable: false });
    expect(byTier.get('frontier')).toMatchObject({ alias: 'ai-hub-frontier', selectable: false });
    expect(byTier.get('most-capable')).toMatchObject({
      alias: 'ai-hub-most-capable',
      selectable: false,
    });
  });

  it('publishes an empty lane as unavailable without borrowing another lane member', () => {
    const parsed = parseModelPipelineConfig(cloneEnvelope());
    const empty = parsed.snapshot.assignments.filter((item) => item.tier_id !== 'balanced');

    expect(empty).toHaveLength(3);
    for (const assignment of empty) {
      expect(assignment.selectable).toBe(false);
      expect(assignment.members).toEqual([]);
    }
    // No agent is bound to an unavailable lane; there is no cross-lane fallback.
    const boundTiers = new Set(parsed.snapshot.agent_bindings.map((item) => item.tier_id));
    expect(boundTiers).toEqual(new Set(['balanced']));
  });

  it('rejects schema_version 2 with the exact ccs_stage=validation error', () => {
    const request = modelPipelineRequestFixture() as Record<string, unknown>;
    request.schema_version = 2;
    expect(() => parseModelPipelinePublicationRequest(request)).toThrow(
      'model_pipeline_publication.schema_version must be a whole number 3 or greater'
    );
  });

  it('rejects schema_version 4 with the exact ccs_stage=validation error', () => {
    const request = modelPipelineRequestFixture() as Record<string, unknown>;
    request.schema_version = 4;
    expect(() => parseModelPipelinePublicationRequest(request)).toThrow(
      'model_pipeline_publication.schema_version must equal 3'
    );
  });

  it('rejects a nested snapshot.schema_version of 2 inside an otherwise valid v3 envelope', () => {
    const request = modelPipelineRequestFixture() as Record<string, unknown>;
    const snapshot = request.snapshot as Record<string, unknown>;
    snapshot.schema_version = 2;
    expect(() => parseModelPipelinePublicationRequest(request)).toThrow(
      'model_pipeline_publication.snapshot.schema_version must equal 3'
    );
  });

  it('requires positive publication ownership values and rejects v1 residue', () => {
    const invalidCases: ReadonlyArray<readonly [string, unknown, string]> = [
      ['request_timeout_seconds', undefined, 'must be a whole number 1 or greater'],
      ['request_timeout_seconds', 0, 'must be a whole number 1 or greater'],
      ['retained_snapshots', 0, 'must be a whole number 1 or greater'],
      ['legacy_atomic_write', true, 'is not part of schema version 3'],
    ];

    for (const [key, value, message] of invalidCases) {
      const envelope = cloneEnvelope();
      const publication = snapshotOf(envelope).publication as Record<string, unknown>;
      if (value === undefined) delete publication[key];
      else publication[key] = value;
      expect(() => parseModelPipelineConfig(envelope)).toThrow(message);
    }
  });

  it('rejects fields outside the exact v3 contract', () => {
    const envelope = cloneEnvelope();
    snapshotOf(envelope).legacy_models = [];

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.legacy_models is not part of schema version 3'
    );
  });

  it('rejects the retired max_candidate_attempts field as v2 residue', () => {
    const envelope = cloneEnvelope();
    const failurePolicy = snapshotOf(envelope).failure_policy as Record<string, unknown>;
    failurePolicy.max_candidate_attempts = 3;

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.failure_policy.max_candidate_attempts is not part of schema version 3'
    );
  });

  it('rejects numeric prices because pricing is lossless decimal text', () => {
    const envelope = cloneEnvelope();
    const pricing = firstCandidate(snapshotOf(envelope)).pricing as Record<string, unknown>;
    const entries = pricing.entries as Array<Record<string, unknown>>;
    entries[0]!.amount = 30;

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.assignments[0].members[0].candidates[0].pricing.entries[0].amount'
    );
  });

  it('rejects flattened and independent model identities', () => {
    const flattened = cloneEnvelope();
    const inventory = snapshotOf(flattened).inventory as Record<string, unknown>;
    const models = inventory.direct_models as Array<Record<string, unknown>>;
    models[0]!.catalog_provider_id = 'openai';
    expect(() => parseModelPipelineConfig(flattened)).toThrow(
      // The mutated field lives inside inventory.direct_models, which is
      // CLIProxy's own contract and stays pinned at schema version 2.
      'catalog_provider_id is not part of schema version 2'
    );

    const independentVariant = cloneEnvelope();
    const catalog = snapshotOf(independentVariant).catalog as Array<Record<string, unknown>>;
    catalog[0]!.variant_id = 'high';
    expect(() => parseModelPipelineConfig(independentVariant)).toThrow(
      'model_pipeline.snapshot.catalog[0].variant_id is not part of schema version 3'
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
      { agent: 'architect', tier_id: 'balanced', alias: 'ai-hub-balanced' },
      { agent: 'architect', tier_id: 'balanced', alias: 'ai-hub-balanced' },
    ];
    expect(() => parseModelPipelineConfig(duplicate)).toThrow(
      'model_pipeline.snapshot.agent_bindings must be unique and sorted'
    );

    const dangling = cloneEnvelope();
    snapshotOf(dangling).agent_bindings = [
      { agent: 'architect', tier_id: 'balanced', alias: 'ai-hub-fast' },
    ];
    expect(() => parseModelPipelineConfig(dangling)).toThrow(
      'must reference the alias allocated to each bound tier'
    );
  });

  it('rejects snapshot digest drift independently from projection identity', () => {
    const envelope = cloneEnvelope();
    snapshotOf(envelope).generated_at = '2026-08-28T12:00:00Z';

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.snapshot_digest must equal sha256:'
    );
  });

  it('requires the receipt to identify the snapshot and exact predecessor', () => {
    const activeDrift = cloneEnvelope();
    const receipt = activeDrift.receipt as Record<string, unknown>;
    const active = receipt.active as Record<string, unknown>;
    active.snapshot_digest = `sha256:${'f'.repeat(64)}`;
    expect(() => parseModelPipelineConfig(activeDrift)).toThrow(
      'model_pipeline.receipt.active must identify the persisted snapshot'
    );

    const predecessorDrift = cloneEnvelope();
    const predecessorReceipt = predecessorDrift.receipt as Record<string, unknown>;
    predecessorReceipt.previous_active = {
      generation: 1,
      snapshot_digest: `sha256:${'1'.repeat(64)}`,
      projection_digest: `sha256:${'2'.repeat(64)}`,
      config_digest: `sha256:${'3'.repeat(64)}`,
    };
    expect(() => parseModelPipelineConfig(predecessorDrift)).toThrow(
      'model_pipeline.receipt.previous_active must be null for generation 1'
    );
  });

  it('accepts only explicit classified candidate failover invariants', () => {
    const invalidCases: ReadonlyArray<readonly [string, unknown, string]> = [
      ['mode', 'retry', 'must equal classified_candidate_failover'],
      ['automatic_retry', true, 'must be false'],
      ['automatic_failover', false, 'must be true'],
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

  it('validates and serializes model_pipeline as the native CCS v3 section', () => {
    const modelPipeline = parseModelPipelineConfig(cloneEnvelope());
    const config = { ...createEmptyUnifiedConfig(), model_pipeline: modelPipeline };

    expect(isUnifiedConfig(config)).toBe(true);
    const serialized = generateYamlWithComments(config);
    expect(serialized).toContain('\nmodel_pipeline:\n');
    expect(serialized).toContain(`snapshot_digest: ${modelPipeline.snapshot.snapshot_digest}`);
    expect(serialized.indexOf('\nmodel_pipeline:\n')).toBeLessThan(
      serialized.indexOf('\ncliproxy_server:\n')
    );

    const invalid = {
      ...config,
      model_pipeline: { schema_version: 3, snapshot: modelPipeline.snapshot },
    };
    expect(isUnifiedConfig(invalid)).toBe(false);
  });

  it('recomputes the fixture digest identically to the production parser', () => {
    // Guards the fixture wrapper itself: its self-computed digest must equal
    // what parseModelPipelineConfig independently derives from the same bytes.
    const snapshot = modelPipelineSnapshotFixture();
    const parsed = parseModelPipelineConfig(modelPipelineConfigFixture());
    expect(parsed.snapshot.snapshot_digest).toBe(snapshot.snapshot_digest);
  });
});
