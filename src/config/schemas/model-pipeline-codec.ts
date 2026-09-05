import { ConfigError } from '../../errors/error-types';
import {
  MODEL_PIPELINE_SCHEMA_VERSION,
  type ModelPipelineCredentialReference,
  type ModelPipelineHealth,
  type ModelPipelineModelKey,
  type ModelPipelinePriceEntry,
  type ModelPipelinePricing,
  type ModelPipelineRestriction,
  type ModelPipelineRouteKey,
  type ModelPipelineSourceDigest,
  type ModelPipelineVariantKey,
} from './model-pipeline-types';

export function fail(path: string, expectation: string): never {
  throw new ConfigError(`${path} ${expectation}`);
}

export function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

export function exactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  path: string
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail(`${path}.${key}`, `is not part of schema version ${MODEL_PIPELINE_SCHEMA_VERSION}`);
    }
  }
}

export function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, 'must be an array');
  return value;
}

export function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fail(path, 'must be a non-empty string');
  }
  return value;
}

export function readStringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') return fail(path, 'must be a string');
  return value;
}

export function readNullableString(value: unknown, path: string): string | null {
  return value === null ? null : readString(value, path);
}

export function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'must be a boolean');
  return value;
}

export function readInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum?: number
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    (maximum !== undefined && value > maximum)
  ) {
    const upper = maximum === undefined ? '' : ` and no greater than ${maximum}`;
    return fail(path, `must be a whole number ${minimum} or greater${upper}`);
  }
  return value;
}

export function readNullableInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum?: number
): number | null {
  return value === null ? null : readInteger(value, path, minimum, maximum);
}

export function readUtcTimestamp(value: unknown, path: string): string {
  const timestamp = readString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(timestamp)) {
    return fail(path, 'must be a UTC RFC3339 timestamp ending in Z');
  }
  if (!Number.isFinite(Date.parse(timestamp))) return fail(path, 'must be a valid timestamp');
  return timestamp;
}

export function readDigest(value: unknown, path: string): string {
  const digest = readString(value, path);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    return fail(path, 'must be a lowercase sha256 digest');
  }
  return digest;
}

export function readDecimal(value: unknown, path: string, signed = false): string {
  const decimal = readString(value, path);
  const pattern = signed ? /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/ : /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (!pattern.test(decimal)) return fail(path, 'must be an exact decimal string');
  return decimal;
}

export function assertSortedUnique(values: readonly string[], path: string): void {
  const expected = [...new Set(values)].sort();
  if (
    values.length !== expected.length ||
    values.some((value, index) => value !== expected[index])
  ) {
    fail(path, 'must be unique and sorted');
  }
}

export function readStringSet(value: unknown, path: string): readonly string[] {
  const values = readArray(value, path).map((entry, index) =>
    readString(entry, `${path}[${index}]`)
  );
  assertSortedUnique(values, path);
  return values;
}

export function readIntegerSet(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): readonly number[] {
  const values = readArray(value, path).map((entry, index) =>
    readInteger(entry, `${path}[${index}]`, minimum, maximum)
  );
  const expected = [...new Set(values)].sort((left, right) => left - right);
  if (
    values.length !== expected.length ||
    values.some((entry, index) => entry !== expected[index])
  ) {
    fail(path, 'must be unique and sorted');
  }
  return values;
}

export function identity(record: Record<string, unknown>, path: string): ModelPipelineModelKey {
  return {
    catalog_provider_id: readString(record.catalog_provider_id, `${path}.catalog_provider_id`),
    canonical_model_id: readString(record.canonical_model_id, `${path}.canonical_model_id`),
  };
}

export function modelKey(value: ModelPipelineModelKey): string {
  return `${value.catalog_provider_id}\u0000${value.canonical_model_id}`;
}

export function candidateKey(value: {
  readonly route_key: ModelPipelineRouteKey;
  readonly variant_id: string | null;
}): string {
  return `${modelKey(value.route_key.model_key)}\u0000${value.route_key.route_channel}\u0000${value.variant_id ?? ''}`;
}

export function parseSourceDigest(value: unknown, path: string): ModelPipelineSourceDigest {
  const record = readRecord(value, path);
  exactKeys(record, ['source_id', 'digest'], path);
  return {
    source_id: readString(record.source_id, `${path}.source_id`),
    digest: readDigest(record.digest, `${path}.digest`),
  };
}

function parseRestriction(value: unknown, path: string): ModelPipelineRestriction {
  const record = readRecord(value, path);
  exactKeys(record, ['rule_id', 'config_path', 'active', 'reason'], path);
  return {
    rule_id: readString(record.rule_id, `${path}.rule_id`),
    config_path: readString(record.config_path, `${path}.config_path`),
    active: readBoolean(record.active, `${path}.active`),
    reason: readString(record.reason, `${path}.reason`),
  };
}

export function parseRestrictions(
  value: unknown,
  path: string
): readonly ModelPipelineRestriction[] {
  const restrictions = readArray(value, path).map((entry, index) =>
    parseRestriction(entry, `${path}[${index}]`)
  );
  assertSortedUnique(
    restrictions.map((item) => item.rule_id),
    path
  );
  return restrictions;
}

export function parseHealth(value: unknown, path: string): ModelPipelineHealth {
  const record = readRecord(value, path);
  exactKeys(record, ['status', 'selectable', 'observed_at', 'latency_ms'], path);
  const status = readString(record.status, `${path}.status`);
  if (
    status !== 'healthy' &&
    status !== 'degraded' &&
    status !== 'blocked' &&
    status !== 'unknown'
  ) {
    fail(`${path}.status`, 'must be healthy, degraded, blocked, or unknown');
  }
  return {
    status,
    selectable: readBoolean(record.selectable, `${path}.selectable`),
    observed_at: readUtcTimestamp(record.observed_at, `${path}.observed_at`),
    latency_ms: readNullableInteger(record.latency_ms, `${path}.latency_ms`, 0),
  };
}

export function parsePricing(value: unknown, path: string): ModelPipelinePricing {
  const record = readRecord(value, path);
  exactKeys(record, ['currency', 'unit', 'source_id', 'entries'], path);
  const entries = readArray(record.entries, `${path}.entries`).map((entry, index) => {
    const entryPath = `${path}.entries[${index}]`;
    const item = readRecord(entry, entryPath);
    exactKeys(item, ['name', 'amount', 'tier_type', 'tier_size', 'context_key'], entryPath);
    const tierType = readNullableString(item.tier_type, `${entryPath}.tier_type`);
    const tierSize = readNullableInteger(item.tier_size, `${entryPath}.tier_size`, 1);
    const contextKey = readNullableString(item.context_key, `${entryPath}.context_key`);
    if (tierSize !== null && tierType === null) {
      fail(`${entryPath}.tier_size`, 'requires tier_type');
    }
    if (contextKey !== null && (tierType !== null || tierSize !== null)) {
      fail(`${entryPath}.context_key`, 'cannot coexist with a structured tier');
    }
    return {
      name: readString(item.name, `${entryPath}.name`),
      amount: readDecimal(item.amount, `${entryPath}.amount`),
      tier_type: tierType,
      tier_size: tierSize,
      context_key: contextKey,
    };
  });
  const priceKey = (entry: ModelPipelinePriceEntry): string =>
    `${entry.context_key ?? ''}\u0000${entry.tier_type ?? ''}\u0000${String(entry.tier_size ?? 0).padStart(20, '0')}\u0000${entry.name}`;
  const keys = entries.map(priceKey);
  const expected = [...new Set(keys)].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(`${path}.entries`, 'must have unique scopes sorted by scope and name');
  }
  return {
    currency: readString(record.currency, `${path}.currency`),
    unit: readString(record.unit, `${path}.unit`),
    source_id: readString(record.source_id, `${path}.source_id`),
    entries,
  };
}

export function parseNestedModelKey(value: unknown, path: string): ModelPipelineModelKey {
  const record = readRecord(value, path);
  exactKeys(record, ['catalog_provider_id', 'canonical_model_id'], path);
  return identity(record, path);
}

export function parseNestedRouteKey(value: unknown, path: string): ModelPipelineRouteKey {
  const record = readRecord(value, path);
  exactKeys(record, ['model_key', 'route_channel'], path);
  return {
    model_key: parseNestedModelKey(record.model_key, `${path}.model_key`),
    route_channel: readString(record.route_channel, `${path}.route_channel`),
  };
}

export function parseNestedVariantKey(value: unknown, path: string): ModelPipelineVariantKey {
  const record = readRecord(value, path);
  exactKeys(record, ['model_key', 'variant_id'], path);
  return {
    model_key: parseNestedModelKey(record.model_key, `${path}.model_key`),
    variant_id: readString(record.variant_id, `${path}.variant_id`),
  };
}

export function parseCredentialReference(
  value: unknown,
  path: string
): ModelPipelineCredentialReference {
  const record = readRecord(value, path);
  exactKeys(record, ['id', 'kind'], path);
  return {
    id: readDigest(record.id, `${path}.id`),
    kind: readString(record.kind, `${path}.kind`),
  };
}

export function readNullableBoolean(value: unknown, path: string): boolean | null {
  return value === null ? null : readBoolean(value, path);
}

export function readNullableSignedInteger(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return fail(path, 'must be null or a safe whole number');
  }
  return value;
}
