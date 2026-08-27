import { ConfigError } from '../../errors/error-types';

export const MODEL_PIPELINE_SCHEMA_VERSION = 1 as const;

export type ModelPipelineJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ModelPipelineJsonValue[]
  | { readonly [key: string]: ModelPipelineJsonValue };

export interface ModelPipelineSourceDigest {
  readonly source_id: string;
  readonly digest: string;
}

export interface ModelPipelineHealth {
  readonly status: string;
  readonly latency_ms: number | null;
}

export type ModelPipelineReason = string | { readonly [key: string]: ModelPipelineJsonValue };

export interface ModelPipelinePricing {
  readonly currency: string;
  readonly source: string;
  readonly source_digest: string;
  readonly fetched_at: string;
  readonly input_per_million: string;
  readonly output_per_million: string;
  readonly cache_read_per_million?: string | null;
  readonly cache_write_per_million?: string | null;
}

export interface ModelPipelineCandidate {
  readonly catalog_provider_id: string;
  readonly canonical_model_id: string;
  readonly route_channel: string;
  readonly variant_id: string | null;
  readonly quota_domain: string;
  readonly protocols: readonly string[];
  readonly health: ModelPipelineHealth;
  readonly restrictions: readonly ModelPipelineReason[];
  readonly pricing: ModelPipelinePricing;
  readonly eligible: boolean;
  readonly rejection_reasons: readonly ModelPipelineReason[];
}

export interface ModelPipelineCatalogVariant {
  readonly variant_id: string;
}

export interface ModelPipelineCatalogModel {
  readonly catalog_provider_id: string;
  readonly canonical_model_id: string;
  readonly variants: readonly ModelPipelineCatalogVariant[];
}

export interface ModelPipelineAssignment {
  readonly tier: string;
  readonly alias: string;
  readonly members: readonly ModelPipelineCandidate[];
  readonly candidates: readonly ModelPipelineCandidate[];
}

export interface ModelPipelineRetryRule {
  readonly classifier: string;
  readonly action: string;
  readonly status?: string | number | null;
}

export interface ModelPipelineRetryPolicy {
  readonly max_attempts: number;
  readonly cooldown_seconds: number;
  readonly rules: readonly ModelPipelineRetryRule[];
}

export interface ModelPipelinePublication {
  readonly targets: readonly string[];
  readonly retention: { readonly [key: string]: ModelPipelineJsonValue };
}

export interface ModelPipelineSnapshot {
  readonly schema_version: number;
  readonly generation: number;
  readonly generated_at: string;
  readonly source_digests: readonly ModelPipelineSourceDigest[];
  readonly inventory: {
    readonly routes: readonly ModelPipelineCandidate[];
  };
  readonly catalog: {
    readonly models: readonly ModelPipelineCatalogModel[];
  };
  readonly observations: readonly ModelPipelineJsonValue[];
  readonly evaluations: readonly ModelPipelineJsonValue[];
  readonly rejections: readonly ModelPipelineJsonValue[];
  readonly assignments: readonly ModelPipelineAssignment[];
  readonly retry_policy: ModelPipelineRetryPolicy;
  readonly publication: ModelPipelinePublication;
  readonly projection_digest: string;
  readonly snapshot_digest: string;
}

export interface ModelPipelineConfig {
  readonly schema_version: typeof MODEL_PIPELINE_SCHEMA_VERSION;
  readonly snapshot: ModelPipelineSnapshot;
}

type MutableJsonRecord = Record<string, ModelPipelineJsonValue>;

function fail(path: string, expectation: string): never {
  throw new ConfigError(`${path} ${expectation}`);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    return fail(path, 'must be an array');
  }
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(path, 'must be a non-empty string');
  }
  return value;
}

function readNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return readString(value, path);
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    return fail(path, 'must be a boolean');
  }
  return value;
}

function readInteger(value: unknown, path: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    return fail(path, `must be a whole number ${minimum} or greater`);
  }
  return value;
}

function readNullableNonNegativeNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fail(path, 'must be null or a non-negative finite number');
  }
  return value;
}

function readUtcTimestamp(value: unknown, path: string): string {
  const timestamp = readString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(timestamp)) {
    return fail(path, 'must be a UTC RFC3339 timestamp ending in Z');
  }
  if (!Number.isFinite(Date.parse(timestamp))) {
    return fail(path, 'must be a valid UTC RFC3339 timestamp');
  }
  return timestamp;
}

function readDecimalString(value: unknown, path: string): string {
  const decimal = readString(value, path);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(decimal)) {
    return fail(path, 'must be a non-negative decimal string');
  }
  return decimal;
}

function readStringArray(value: unknown, path: string): readonly string[] {
  return readArray(value, path).map((entry, index) => readString(entry, `${path}[${index}]`));
}

function validateJsonValue(value: unknown, path: string): ModelPipelineJsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => validateJsonValue(entry, `${path}[${index}]`));
  }
  const record = readRecord(value, path);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, validateJsonValue(entry, `${path}.${key}`)])
  );
}

function preserveRecord(record: Record<string, unknown>, path: string): MutableJsonRecord {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, validateJsonValue(value, `${path}.${key}`)])
  );
}

function parseReason(value: unknown, path: string): ModelPipelineReason {
  if (typeof value === 'string') return readString(value, path);
  return preserveRecord(readRecord(value, path), path);
}

function parseReasonArray(value: unknown, path: string): readonly ModelPipelineReason[] {
  return readArray(value, path).map((entry, index) => parseReason(entry, `${path}[${index}]`));
}

function parseHealth(value: unknown, path: string): ModelPipelineHealth {
  const record = readRecord(value, path);
  return {
    ...preserveRecord(record, path),
    status: readString(record.status, `${path}.status`),
    latency_ms: readNullableNonNegativeNumber(record.latency_ms, `${path}.latency_ms`),
  };
}

function parsePricing(value: unknown, path: string): ModelPipelinePricing {
  const record = readRecord(value, path);
  for (const [key, rate] of Object.entries(record)) {
    if (
      !key.endsWith('_per_million') ||
      key === 'input_per_million' ||
      key === 'output_per_million'
    ) {
      continue;
    }
    if (rate !== null) readDecimalString(rate, `${path}.${key}`);
  }

  const cacheRead =
    record.cache_read_per_million === undefined
      ? undefined
      : record.cache_read_per_million === null
        ? null
        : readDecimalString(record.cache_read_per_million, `${path}.cache_read_per_million`);
  const cacheWrite =
    record.cache_write_per_million === undefined
      ? undefined
      : record.cache_write_per_million === null
        ? null
        : readDecimalString(record.cache_write_per_million, `${path}.cache_write_per_million`);

  return {
    ...preserveRecord(record, path),
    currency: readString(record.currency, `${path}.currency`),
    source: readString(record.source, `${path}.source`),
    source_digest: readString(record.source_digest, `${path}.source_digest`),
    fetched_at: readUtcTimestamp(record.fetched_at, `${path}.fetched_at`),
    input_per_million: readDecimalString(record.input_per_million, `${path}.input_per_million`),
    output_per_million: readDecimalString(record.output_per_million, `${path}.output_per_million`),
    ...(cacheRead === undefined ? {} : { cache_read_per_million: cacheRead }),
    ...(cacheWrite === undefined ? {} : { cache_write_per_million: cacheWrite }),
  };
}

function parseCandidate(value: unknown, path: string): ModelPipelineCandidate {
  const record = readRecord(value, path);
  const variantId = readNullableString(record.variant_id, `${path}.variant_id`);
  const protocols = readStringArray(record.protocols, `${path}.protocols`);
  if (protocols.length === 0) {
    return fail(`${path}.protocols`, 'must contain at least one protocol');
  }

  return {
    ...preserveRecord(record, path),
    catalog_provider_id: readString(record.catalog_provider_id, `${path}.catalog_provider_id`),
    canonical_model_id: readString(record.canonical_model_id, `${path}.canonical_model_id`),
    route_channel: readString(record.route_channel, `${path}.route_channel`),
    variant_id: variantId,
    quota_domain: readString(record.quota_domain, `${path}.quota_domain`),
    protocols,
    health: parseHealth(record.health, `${path}.health`),
    restrictions: parseReasonArray(record.restrictions, `${path}.restrictions`),
    pricing: parsePricing(record.pricing, `${path}.pricing`),
    eligible: readBoolean(record.eligible, `${path}.eligible`),
    rejection_reasons: parseReasonArray(record.rejection_reasons, `${path}.rejection_reasons`),
  };
}

function candidateKey(candidate: ModelPipelineCandidate): string {
  return [
    candidate.catalog_provider_id,
    candidate.canonical_model_id,
    candidate.route_channel,
    candidate.variant_id ?? '',
  ].join('\u0000');
}

function modelKey(candidate: ModelPipelineCandidate): string {
  return `${candidate.catalog_provider_id}/${candidate.canonical_model_id}`;
}

function parseCandidateList(value: unknown, path: string): readonly ModelPipelineCandidate[] {
  const candidates = readArray(value, path).map((entry, index) =>
    parseCandidate(entry, `${path}[${index}]`)
  );
  const keys = new Set<string>();
  for (let index = 0; index < candidates.length; index += 1) {
    const key = candidateKey(candidates[index]);
    if (keys.has(key)) {
      return fail(`${path}[${index}]`, 'duplicates an earlier CandidateKey');
    }
    keys.add(key);
  }
  return candidates;
}

function parseAssignment(value: unknown, path: string): ModelPipelineAssignment {
  const record = readRecord(value, path);
  const candidates = parseCandidateList(record.candidates, `${path}.candidates`);
  const members = parseCandidateList(record.members, `${path}.members`);
  const candidateKeys = new Set(candidates.map(candidateKey));
  for (let index = 0; index < members.length; index += 1) {
    if (!candidateKeys.has(candidateKey(members[index]))) {
      return fail(`${path}.members[${index}]`, 'is not present in candidates');
    }
  }
  return {
    ...preserveRecord(record, path),
    tier: readString(record.tier, `${path}.tier`),
    alias: readString(record.alias, `${path}.alias`),
    members,
    candidates,
  };
}

function parseAssignments(value: unknown, path: string): readonly ModelPipelineAssignment[] {
  const assignments = readArray(value, path).map((entry, index) =>
    parseAssignment(entry, `${path}[${index}]`)
  );
  const tiers = new Set<string>();
  const aliases = new Set<string>();
  const assignedModels = new Map<string, string>();
  for (const assignment of assignments) {
    if (tiers.has(assignment.tier)) {
      return fail(path, `contains duplicate tier ${assignment.tier}`);
    }
    if (aliases.has(assignment.alias)) {
      return fail(path, `contains duplicate alias ${assignment.alias}`);
    }
    tiers.add(assignment.tier);
    aliases.add(assignment.alias);
    for (const member of assignment.members) {
      const key = modelKey(member);
      const previousTier = assignedModels.get(key);
      if (previousTier && previousTier !== assignment.tier) {
        return fail(
          path,
          `canonical model ${key} is assigned to both ${previousTier} and ${assignment.tier}`
        );
      }
      assignedModels.set(key, assignment.tier);
    }
  }
  return assignments;
}

function parseCatalogModel(value: unknown, path: string): ModelPipelineCatalogModel {
  const record = readRecord(value, path);
  if (Object.prototype.hasOwnProperty.call(record, 'variant_id')) {
    return fail(`${path}.variant_id`, 'is forbidden; variants must be nested under their model');
  }
  const variants = readArray(record.variants, `${path}.variants`).map((entry, index) => {
    const variantPath = `${path}.variants[${index}]`;
    const variant = readRecord(entry, variantPath);
    return {
      ...preserveRecord(variant, variantPath),
      variant_id: readString(variant.variant_id, `${variantPath}.variant_id`),
    };
  });
  return {
    ...preserveRecord(record, path),
    catalog_provider_id: readString(record.catalog_provider_id, `${path}.catalog_provider_id`),
    canonical_model_id: readString(record.canonical_model_id, `${path}.canonical_model_id`),
    variants,
  };
}

function parseSourceDigests(value: unknown, path: string): readonly ModelPipelineSourceDigest[] {
  const sources = readArray(value, path).map((entry, index) => {
    const sourcePath = `${path}[${index}]`;
    const record = readRecord(entry, sourcePath);
    return {
      source_id: readString(record.source_id, `${sourcePath}.source_id`),
      digest: readString(record.digest, `${sourcePath}.digest`),
    };
  });
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.source_id)) {
      return fail(path, `contains duplicate source_id ${source.source_id}`);
    }
    sourceIds.add(source.source_id);
  }
  return sources;
}

function parseRetryPolicy(value: unknown, path: string): ModelPipelineRetryPolicy {
  const record = readRecord(value, path);
  const rules = readArray(record.rules, `${path}.rules`).map((entry, index) => {
    const rulePath = `${path}.rules[${index}]`;
    const rule = readRecord(entry, rulePath);
    const status = rule.status;
    if (
      status !== undefined &&
      status !== null &&
      typeof status !== 'string' &&
      (typeof status !== 'number' || !Number.isInteger(status))
    ) {
      return fail(`${rulePath}.status`, 'must be a string, whole number, or null');
    }
    return {
      ...preserveRecord(rule, rulePath),
      classifier: readString(rule.classifier, `${rulePath}.classifier`),
      action: readString(rule.action, `${rulePath}.action`),
      ...(status === undefined ? {} : { status }),
    };
  });
  return {
    ...preserveRecord(record, path),
    max_attempts: readInteger(record.max_attempts, `${path}.max_attempts`, 1),
    cooldown_seconds: readInteger(record.cooldown_seconds, `${path}.cooldown_seconds`, 0),
    rules,
  };
}

function parsePublication(value: unknown, path: string): ModelPipelinePublication {
  const record = readRecord(value, path);
  const targets = readStringArray(record.targets, `${path}.targets`);
  if (targets.length === 0) {
    return fail(`${path}.targets`, 'must contain at least one target');
  }
  const retentionRecord = readRecord(record.retention, `${path}.retention`);
  return {
    ...preserveRecord(record, path),
    targets,
    retention: preserveRecord(retentionRecord, `${path}.retention`),
  };
}

function parseSnapshot(value: unknown, path: string): ModelPipelineSnapshot {
  const record = readRecord(value, path);
  const inventoryRecord = readRecord(record.inventory, `${path}.inventory`);
  const catalogRecord = readRecord(record.catalog, `${path}.catalog`);
  const routes = parseCandidateList(inventoryRecord.routes, `${path}.inventory.routes`);
  const models = readArray(catalogRecord.models, `${path}.catalog.models`).map((entry, index) =>
    parseCatalogModel(entry, `${path}.catalog.models[${index}]`)
  );
  const schemaVersion = readInteger(record.schema_version, `${path}.schema_version`, 1);
  if (schemaVersion !== MODEL_PIPELINE_SCHEMA_VERSION) {
    return fail(`${path}.schema_version`, `must equal ${MODEL_PIPELINE_SCHEMA_VERSION}`);
  }

  return {
    ...preserveRecord(record, path),
    schema_version: schemaVersion,
    generation: readInteger(record.generation, `${path}.generation`, 1),
    generated_at: readUtcTimestamp(record.generated_at, `${path}.generated_at`),
    source_digests: parseSourceDigests(record.source_digests, `${path}.source_digests`),
    inventory: {
      ...preserveRecord(inventoryRecord, `${path}.inventory`),
      routes,
    },
    catalog: {
      ...preserveRecord(catalogRecord, `${path}.catalog`),
      models,
    },
    observations: readArray(record.observations, `${path}.observations`).map((entry, index) =>
      validateJsonValue(entry, `${path}.observations[${index}]`)
    ),
    evaluations: readArray(record.evaluations, `${path}.evaluations`).map((entry, index) =>
      validateJsonValue(entry, `${path}.evaluations[${index}]`)
    ),
    rejections: readArray(record.rejections, `${path}.rejections`).map((entry, index) =>
      validateJsonValue(entry, `${path}.rejections[${index}]`)
    ),
    assignments: parseAssignments(record.assignments, `${path}.assignments`),
    retry_policy: parseRetryPolicy(record.retry_policy, `${path}.retry_policy`),
    publication: parsePublication(record.publication, `${path}.publication`),
    projection_digest: readString(record.projection_digest, `${path}.projection_digest`),
    snapshot_digest: readString(record.snapshot_digest, `${path}.snapshot_digest`),
  };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return Object.freeze(value);
}

export function parseModelPipelineConfig(value: unknown): ModelPipelineConfig {
  const path = 'model_pipeline';
  const record = readRecord(value, path);
  const schemaVersion = readInteger(record.schema_version, `${path}.schema_version`, 1);
  if (schemaVersion !== MODEL_PIPELINE_SCHEMA_VERSION) {
    return fail(`${path}.schema_version`, `must equal ${MODEL_PIPELINE_SCHEMA_VERSION}`);
  }
  const parsed: ModelPipelineConfig = {
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    snapshot: parseSnapshot(record.snapshot, `${path}.snapshot`),
  };
  return deepFreeze(parsed);
}

export function isModelPipelineConfig(value: unknown): value is ModelPipelineConfig {
  try {
    parseModelPipelineConfig(value);
    return true;
  } catch {
    return false;
  }
}
