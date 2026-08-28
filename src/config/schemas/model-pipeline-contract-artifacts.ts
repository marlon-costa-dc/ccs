import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigError } from '../../errors/error-types';
import { canonicalJson, sha256Digest } from '../../utils/canonical-json';

const SNAPSHOT_SCHEMA_FILENAME = 'model-pipeline-snapshot-v2.json';

function resolveSnapshotSchemaPath(): string {
  return path.resolve(__dirname, '..', '..', '..', 'schemas', SNAPSHOT_SCHEMA_FILENAME);
}

export function getModelPipelineSnapshotSchemaDigest(): string {
  const schemaPath = resolveSnapshotSchemaPath();
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(schemaPath);
  } catch (error) {
    throw new ConfigError(
      'canonical model pipeline snapshot schema artifact is unavailable',
      schemaPath,
      error
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new ConfigError(
      'canonical model pipeline snapshot schema artifact is invalid JSON',
      schemaPath,
      error
    );
  }
  const canonicalBytes = Buffer.from(canonicalJson(parsed), 'utf8');
  if (!bytes.equals(canonicalBytes)) {
    throw new ConfigError(
      'canonical model pipeline snapshot schema artifact bytes are not canonical JSON',
      schemaPath
    );
  }
  return sha256Digest(bytes);
}
