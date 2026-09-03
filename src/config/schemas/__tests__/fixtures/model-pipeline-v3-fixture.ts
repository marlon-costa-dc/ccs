import snapshotFixture from './model-pipeline-snapshot-v3.json';

const SNAPSHOT_SCHEMA_DIGEST =
  'sha256:2ea7574a8c69c227a1741acffa22d82ab48dd4715cfd4713f0c6d2ed5691a8d9';
const PROJECTION_DIGEST = `sha256:${'b'.repeat(64)}`;
const CONFIG_DIGEST = `sha256:${'c'.repeat(64)}`;

export function modelPipelineSnapshotFixture(): Record<string, unknown> {
  return structuredClone(snapshotFixture) as unknown as Record<string, unknown>;
}

export function modelPipelineConfigFixture(): Record<string, unknown> {
  const snapshot = modelPipelineSnapshotFixture();
  const inventory = snapshot.inventory as Record<string, unknown>;
  return {
    schema_version: 3,
    snapshot,
    receipt: {
      schema_version: 3,
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
        version: 'ccs-fixture-v3',
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
    schema_version: 3,
    expected_active: null,
    snapshot: modelPipelineSnapshotFixture(),
  };
}
