import snapshotFixture from './model-pipeline-snapshot-v2.json';

const SNAPSHOT_SCHEMA_DIGEST =
  'sha256:de6a5b76c5b9529ddd894f331ff1754d514ff15efaba617c01047eb7191fdea9';
const PROJECTION_DIGEST = `sha256:${'b'.repeat(64)}`;
const CONFIG_DIGEST = `sha256:${'c'.repeat(64)}`;

export function modelPipelineSnapshotFixture(): Record<string, unknown> {
  return structuredClone(snapshotFixture) as unknown as Record<string, unknown>;
}

export function modelPipelineConfigFixture(): Record<string, unknown> {
  const snapshot = modelPipelineSnapshotFixture();
  const inventory = snapshot.inventory as Record<string, unknown>;
  return {
    schema_version: 2,
    snapshot,
    receipt: {
      schema_version: 2,
      ok: true,
      previous_active: null,
      active: {
        generation: snapshot.generation,
        snapshot_digest: snapshot.snapshot_digest,
        projection_digest: PROJECTION_DIGEST,
        config_digest: CONFIG_DIGEST,
      },
      snapshot_schema_digest: SNAPSHOT_SCHEMA_DIGEST,
      routing_schema_digest: (inventory.routing_schema as Record<string, unknown>).digest,
      ccs_binary: {
        version: 'ccs-fixture-v2',
        commit: 'ccs-fixture-commit',
        built_at: '2026-08-28T11:15:00Z',
      },
      cliproxy_binary: inventory.binary_provenance,
      loaded_at: '2026-08-28T11:20:57Z',
    },
  };
}

export function modelPipelineRequestFixture(): Record<string, unknown> {
  return {
    schema_version: 2,
    expected_active: null,
    snapshot: modelPipelineSnapshotFixture(),
  };
}
