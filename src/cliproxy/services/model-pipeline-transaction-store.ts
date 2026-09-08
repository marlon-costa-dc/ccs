import * as fs from 'node:fs';
import * as path from 'node:path';
import * as lockfile from 'proper-lockfile';
import {
  MODEL_PIPELINE_SCHEMA_VERSION,
  parseActiveIdentityV3,
  parseModelPipelineBinaryProvenance,
  parseModelPipelinePublicationRequest,
  type ActiveIdentityV3,
  type ModelPipelineBinaryProvenance,
  type ModelPipelinePublicationRequest,
} from '../../config/schemas/model-pipeline';
import { getCcsDir } from '../../config/config-loader-facade';
import { ConfigError } from '../../errors/error-types';

const TRANSACTION_DIRECTORY = 'model-pipeline-publication';
const INTENT_FILENAME = 'intent-v3.json';

export interface ModelPipelinePublicationIntent {
  readonly schema_version: typeof MODEL_PIPELINE_SCHEMA_VERSION;
  readonly request: ModelPipelinePublicationRequest;
  readonly proposed_active: ActiveIdentityV3;
  readonly snapshot_schema_digest: string;
  readonly routing_schema_digest: string;
  readonly ccs_binary: ModelPipelineBinaryProvenance;
  readonly config_yaml: string;
}

function readRecord(value: unknown, pathLabel: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${pathLabel} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  pathLabel: string
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new ConfigError(`${pathLabel}.${key} is not part of the v3 transaction contract`);
    }
  }
  for (const key of allowedKeys) {
    if (!(key in record)) throw new ConfigError(`${pathLabel}.${key} is required`);
  }
}

function readDigest(value: unknown, pathLabel: string): string {
  if (typeof value !== 'string' || !/^sha256:[a-f\d]{64}$/.test(value)) {
    throw new ConfigError(`${pathLabel} must be a lowercase sha256 digest`);
  }
  return value;
}

function parseIntent(value: unknown): ModelPipelinePublicationIntent {
  const record = readRecord(value, 'model pipeline publication intent');
  exactKeys(
    record,
    [
      'schema_version',
      'request',
      'proposed_active',
      'snapshot_schema_digest',
      'routing_schema_digest',
      'ccs_binary',
      'config_yaml',
    ],
    'model pipeline publication intent'
  );
  if (record.schema_version !== MODEL_PIPELINE_SCHEMA_VERSION) {
    throw new ConfigError(
      `model pipeline publication intent.schema_version must equal ${MODEL_PIPELINE_SCHEMA_VERSION}`
    );
  }
  if (typeof record.config_yaml !== 'string' || record.config_yaml.length === 0) {
    throw new ConfigError('model pipeline publication intent.config_yaml must be non-empty');
  }
  return {
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    request: parseModelPipelinePublicationRequest(record.request),
    proposed_active: parseActiveIdentityV3(
      record.proposed_active,
      'model pipeline publication intent.proposed_active'
    ),
    snapshot_schema_digest: readDigest(
      record.snapshot_schema_digest,
      'model pipeline publication intent.snapshot_schema_digest'
    ),
    routing_schema_digest: readDigest(
      record.routing_schema_digest,
      'model pipeline publication intent.routing_schema_digest'
    ),
    ccs_binary: parseModelPipelineBinaryProvenance(
      record.ccs_binary,
      'model pipeline publication intent.ccs_binary'
    ),
    config_yaml: record.config_yaml,
  };
}

function fsyncDirectory(directory: string): void {
  let descriptor: number;
  try {
    descriptor = fs.openSync(directory, 'r');
  } catch (error) {
    throw new ConfigError('failed to open directory for fsync', directory, error);
  }
  let syncError: unknown;
  try {
    fs.fsyncSync(descriptor);
  } catch (error) {
    syncError = error;
  }
  try {
    fs.closeSync(descriptor);
  } catch (closeError) {
    throw new ConfigError(
      syncError ? 'directory fsync and descriptor close both failed' : 'directory close failed',
      directory,
      syncError ? { syncError, closeError } : closeError
    );
  }
  if (syncError) throw new ConfigError('directory fsync failed', directory, syncError);
}

function throwWriteFailure(
  intentPath: string,
  writeError: unknown,
  closeError: unknown,
  cleanupError: unknown
): never {
  const failures = [writeError, closeError, cleanupError].filter(
    (failure): failure is NonNullable<unknown> => failure !== undefined
  );
  throw new ConfigError(
    failures.length > 1
      ? 'failed to durably write model pipeline publication intent with additional cleanup failures'
      : 'failed to durably write model pipeline publication intent',
    intentPath,
    failures.length === 1 ? failures[0] : { failures }
  );
}

export class ModelPipelineTransactionStore {
  readonly directory: string;
  readonly intentPath: string;

  constructor(ccsDirectory = getCcsDir()) {
    this.directory = path.join(ccsDirectory, TRANSACTION_DIRECTORY);
    this.intentPath = path.join(this.directory, INTENT_FILENAME);
  }

  initialize(): void {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  readIntent(): ModelPipelinePublicationIntent | null {
    if (!fs.existsSync(this.intentPath)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.intentPath, 'utf8'));
    } catch (error) {
      throw new ConfigError(
        'model pipeline publication intent is unreadable',
        this.intentPath,
        error
      );
    }
    return parseIntent(parsed);
  }

  writeIntent(intent: ModelPipelinePublicationIntent): void {
    if (fs.existsSync(this.intentPath)) {
      throw new ConfigError('unrecovered model pipeline publication intent already exists');
    }
    const candidatePath = `${this.intentPath}.${process.pid}.candidate`;
    const content = JSON.stringify(intent);
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(candidatePath, 'wx', 0o600);
      fs.writeFileSync(descriptor, content, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(candidatePath, this.intentPath);
      fsyncDirectory(this.directory);
    } catch (error) {
      let closeError: unknown;
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch (failure) {
          closeError = failure;
        }
      }
      let cleanupError: unknown;
      try {
        if (fs.existsSync(candidatePath)) fs.unlinkSync(candidatePath);
      } catch (cleanupFailure) {
        cleanupError = cleanupFailure;
      }
      throwWriteFailure(this.intentPath, error, closeError, cleanupError);
    }
  }

  removeIntent(): void {
    fs.unlinkSync(this.intentPath);
    fsyncDirectory(this.directory);
  }
}

export async function withModelPipelineTransactionLock<T>(
  operation: (store: ModelPipelineTransactionStore) => Promise<T>,
  ccsDirectory = getCcsDir()
): Promise<T> {
  const store = new ModelPipelineTransactionStore(ccsDirectory);
  store.initialize();
  const release = await lockfile.lock(store.directory, { realpath: true, retries: 0 });
  let result: T | undefined;
  let operationError: unknown;
  try {
    result = await operation(store);
  } catch (error) {
    operationError = error;
  }
  try {
    await release();
  } catch (releaseError) {
    throw new ConfigError(
      operationError
        ? 'model pipeline transaction and interprocess lock release both failed'
        : 'model pipeline interprocess lock release failed',
      store.directory,
      operationError ? { operationError, releaseError } : releaseError
    );
  }
  if (operationError) throw operationError;
  return result as T;
}
