import snapshotFixture from './model-pipeline-snapshot-v3.json';
import { canonicalJsonSha256Digest } from '../../../../utils/canonical-json';
import { getModelPipelineSnapshotSchemaDigest } from '../../model-pipeline-contract-artifacts';
const PROJECTION_DIGEST = `sha256:${'b'.repeat(64)}`;
const CONFIG_DIGEST = `sha256:${'c'.repeat(64)}`;

/**
 * Return the fixture snapshot with its `snapshot_digest` recomputed over the
 * exact semantic payload, mirroring `parseSnapshot`'s own digest derivation so
 * the fixture never depends on a hand-maintained hash.
 */
export function modelPipelineSnapshotFixture(): Record<string, unknown> {
  const raw = structuredClone(snapshotFixture) as unknown as Record<string, unknown>;
  const { snapshot_digest: _ignored, ...semantic } = raw;
  return { ...semantic, snapshot_digest: canonicalJsonSha256Digest(semantic) };
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
      snapshot_schema_digest: getModelPipelineSnapshotSchemaDigest(),
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
