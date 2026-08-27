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
      'sha256:6d505e335548fe916e49b679e5a5c5265262f1b552217c7afcc54dbd890d451f'
    );
    expect(parsed.snapshot.snapshot_digest).toBe(
      'sha256:2d8c52223e9249975146a7383d7e91b4c10a2aadce66d0c31a1cc29be430d34e'
    );
    expect(parsed.snapshot.assignments[0]?.candidates[0]?.pricing?.entries).toHaveLength(9);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot.inventory.models[0]?.routes[0]?.credentials)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot.assignments[0]?.candidates[0]?.pricing?.entries)).toBe(
      true
    );
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

  it('rejects semantic drift when the projection digest is stale', () => {
    const envelope = cloneEnvelope();
    snapshotOf(envelope).generated_at = '2026-08-27T19:00:00Z';

    expect(() => parseModelPipelineConfig(envelope)).toThrow(
      'model_pipeline.snapshot.projection_digest must equal sha256:'
    );
  });

  it('validates and serializes model_pipeline as a native top-level CCS section', () => {
    const modelPipeline = parseModelPipelineConfig(fixture.model_pipeline);
    const config = { ...createEmptyUnifiedConfig(), model_pipeline: modelPipeline };

    expect(isUnifiedConfig(config)).toBe(true);
    const serialized = generateYamlWithComments(config);
    expect(serialized).toContain('\nmodel_pipeline:\n');
    expect(serialized).toContain(
      'snapshot_digest: sha256:2d8c52223e9249975146a7383d7e91b4c10a2aadce66d0c31a1cc29be430d34e'
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
