import { createHash } from 'node:crypto';
import { ConfigError } from '../../errors/error-types';

import {
  MODEL_PIPELINE_SCHEMA_VERSION,
  type ModelPipelineAgentBinding,
  type ModelPipelineAssignment,
  type ModelPipelineCandidate,
  type ModelPipelineCandidateEvaluation,
  type ModelPipelineCandidateRejection,
  type ModelPipelineCapabilities,
  type ModelPipelineCatalogBenchmark,
  type ModelPipelineCatalogModel,
  type ModelPipelineCatalogRoute,
  type ModelPipelineCatalogVariant,
  type ModelPipelineConfig,
  type ModelPipelineCredentialReference,
  type ModelPipelineEvaluationMetric,
  type ModelPipelineFailoverRule,
  type ModelPipelineFailureKind,
  type ModelPipelineHealth,
  type ModelPipelineInventory,
  type ModelPipelineInventoryActive,
  type ModelPipelineInventoryCredential,
  type ModelPipelineInventoryModel,
  type ModelPipelineInventoryRoute,
  type ModelPipelineLimits,
  type ModelPipelineModalities,
  type ModelPipelineModelKey,
  type ModelPipelineObservation,
  type ModelPipelinePriceEntry,
  type ModelPipelinePricing,
  type ModelPipelinePublication,
  type ModelPipelineReasoningOption,
  type ModelPipelineRestriction,
  type ModelPipelineFailurePolicy,
  type ModelPipelineRouteKey,
  type ModelPipelineRuleEvaluation,
  type ModelPipelineSnapshot,
  type ModelPipelineSourceDigest,
} from './model-pipeline-types';

export * from './model-pipeline-types';

function fail(path: string, expectation: string): never {
  throw new ConfigError(`${path} ${expectation}`);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], path: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, 'is not part of schema version 1');
  }
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, 'must be an array');
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fail(path, 'must be a non-empty string');
  }
  return value;
}

function readNullableString(value: unknown, path: string): string | null {
  return value === null ? null : readString(value, path);
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'must be a boolean');
  return value;
}

function readInteger(value: unknown, path: string, minimum: number, maximum?: number): number {
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

function readNullableInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum?: number
): number | null {
  return value === null ? null : readInteger(value, path, minimum, maximum);
}

function readUtcTimestamp(value: unknown, path: string): string {
  const timestamp = readString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(timestamp)) {
    return fail(path, 'must be a UTC RFC3339 timestamp ending in Z');
  }
  if (!Number.isFinite(Date.parse(timestamp))) return fail(path, 'must be a valid timestamp');
  return timestamp;
}

function readDigest(value: unknown, path: string): string {
  const digest = readString(value, path);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    return fail(path, 'must be a lowercase sha256 digest');
  }
  return digest;
}

function readDecimal(value: unknown, path: string, signed = false): string {
  const decimal = readString(value, path);
  const pattern = signed ? /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/ : /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (!pattern.test(decimal)) return fail(path, 'must be an exact decimal string');
  return decimal;
}

function assertSortedUnique(values: readonly string[], path: string): void {
  const expected = [...new Set(values)].sort();
  if (
    values.length !== expected.length ||
    values.some((value, index) => value !== expected[index])
  ) {
    fail(path, 'must be unique and sorted');
  }
}

function readStringSet(value: unknown, path: string): readonly string[] {
  const values = readArray(value, path).map((entry, index) =>
    readString(entry, `${path}[${index}]`)
  );
  assertSortedUnique(values, path);
  return values;
}

function readIntegerSet(
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

function identity(record: Record<string, unknown>, path: string): ModelPipelineModelKey {
  return {
    catalog_provider_id: readString(record.catalog_provider_id, `${path}.catalog_provider_id`),
    canonical_model_id: readString(record.canonical_model_id, `${path}.canonical_model_id`),
  };
}

function routeIdentity(record: Record<string, unknown>, path: string): ModelPipelineRouteKey {
  return {
    ...identity(record, path),
    route_channel: readString(record.route_channel, `${path}.route_channel`),
  };
}

function modelKey(value: ModelPipelineModelKey): string {
  return `${value.catalog_provider_id}\u0000${value.canonical_model_id}`;
}

function candidateKey(
  value: ModelPipelineRouteKey & { readonly variant_id: string | null }
): string {
  return `${modelKey(value)}\u0000${value.route_channel}\u0000${value.variant_id ?? ''}`;
}

function parseSourceDigest(value: unknown, path: string): ModelPipelineSourceDigest {
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

function parseRestrictions(value: unknown, path: string): readonly ModelPipelineRestriction[] {
  const restrictions = readArray(value, path).map((entry, index) =>
    parseRestriction(entry, `${path}[${index}]`)
  );
  assertSortedUnique(
    restrictions.map((item) => item.rule_id),
    path
  );
  return restrictions;
}

function parseHealth(value: unknown, path: string): ModelPipelineHealth {
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

function parsePricing(value: unknown, path: string): ModelPipelinePricing {
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

function parseNestedModelKey(value: unknown, path: string): ModelPipelineModelKey {
  const record = readRecord(value, path);
  exactKeys(record, ['catalog_provider_id', 'canonical_model_id'], path);
  return identity(record, path);
}

function parseNestedRouteKey(value: unknown, path: string): ModelPipelineRouteKey {
  const record = readRecord(value, path);
  exactKeys(record, ['catalog_provider_id', 'canonical_model_id', 'route_channel'], path);
  return routeIdentity(record, path);
}

function parseCredentialReference(value: unknown, path: string): ModelPipelineCredentialReference {
  const record = readRecord(value, path);
  exactKeys(record, ['id', 'kind'], path);
  return {
    id: readDigest(record.id, `${path}.id`),
    kind: readString(record.kind, `${path}.kind`),
  };
}

function parseInventoryCredential(value: unknown, path: string): ModelPipelineInventoryCredential {
  const record = readRecord(value, path);
  exactKeys(
    record,
    ['credential_ref', 'quota_domain', 'health', 'quota', 'suspension', 'restrictions'],
    path
  );
  const credentialPath = `${path}.credential_ref`;
  const quotaPath = `${path}.quota`;
  const quota = readRecord(record.quota, quotaPath);
  exactKeys(quota, ['status', 'remaining', 'resets_at', 'reason'], quotaPath);
  if (quota.status !== 'available' && quota.status !== 'blocked' && quota.status !== 'unknown') {
    fail(`${quotaPath}.status`, 'must be available, blocked, or unknown');
  }
  const suspensionPath = `${path}.suspension`;
  const suspension = readRecord(record.suspension, suspensionPath);
  exactKeys(suspension, ['active', 'reason', 'resumes_at'], suspensionPath);
  const suspensionActive = readBoolean(suspension.active, `${suspensionPath}.active`);
  const suspensionReason = readNullableString(suspension.reason, `${suspensionPath}.reason`);
  if (suspensionActive && suspensionReason === null) {
    fail(`${suspensionPath}.reason`, 'is required for an active suspension');
  }
  return {
    credential_ref: {
      ...parseCredentialReference(record.credential_ref, credentialPath),
    },
    quota_domain: readString(record.quota_domain, `${path}.quota_domain`),
    health: parseHealth(record.health, `${path}.health`),
    quota: {
      status: quota.status,
      remaining: readNullableString(quota.remaining, `${quotaPath}.remaining`),
      resets_at:
        quota.resets_at === null
          ? null
          : readUtcTimestamp(quota.resets_at, `${quotaPath}.resets_at`),
      reason: readNullableString(quota.reason, `${quotaPath}.reason`),
    },
    suspension: {
      active: suspensionActive,
      reason: suspensionReason,
      resumes_at:
        suspension.resumes_at === null
          ? null
          : readUtcTimestamp(suspension.resumes_at, `${suspensionPath}.resumes_at`),
    },
    restrictions: parseRestrictions(record.restrictions, `${path}.restrictions`),
  };
}

function parseInventoryRoute(value: unknown, path: string): ModelPipelineInventoryRoute {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'route_key',
      'catalog_route_provider_id',
      'catalog_route_model_id',
      'runtime_model_id',
      'route_selector',
      'quota_domains',
      'protocols',
      'restrictions',
      'health',
      'selectable',
      'selection_reason',
      'credentials',
    ],
    path
  );
  const quotaDomains = readStringSet(record.quota_domains, `${path}.quota_domains`);
  const credentials = readArray(record.credentials, `${path}.credentials`).map((entry, index) =>
    parseInventoryCredential(entry, `${path}.credentials[${index}]`)
  );
  assertSortedUnique(
    credentials.map((item) => item.credential_ref.id),
    `${path}.credentials`
  );
  for (const credential of credentials) {
    if (!quotaDomains.includes(credential.quota_domain)) {
      fail(`${path}.credentials`, 'contains a quota_domain not declared by the route');
    }
  }
  return {
    route_key: parseNestedRouteKey(record.route_key, `${path}.route_key`),
    catalog_route_provider_id: readString(
      record.catalog_route_provider_id,
      `${path}.catalog_route_provider_id`
    ),
    catalog_route_model_id: readString(
      record.catalog_route_model_id,
      `${path}.catalog_route_model_id`
    ),
    runtime_model_id: readString(record.runtime_model_id, `${path}.runtime_model_id`),
    route_selector: readDigest(record.route_selector, `${path}.route_selector`),
    quota_domains: quotaDomains,
    protocols: readStringSet(record.protocols, `${path}.protocols`),
    restrictions: parseRestrictions(record.restrictions, `${path}.restrictions`),
    health: parseHealth(record.health, `${path}.health`),
    selectable: readBoolean(record.selectable, `${path}.selectable`),
    selection_reason: readString(record.selection_reason, `${path}.selection_reason`),
    credentials,
  };
}

function parseInventoryModel(value: unknown, path: string): ModelPipelineInventoryModel {
  const record = readRecord(value, path);
  exactKeys(record, ['model_key', 'display_name', 'active', 'variants', 'routes'], path);
  const modelIdentity = parseNestedModelKey(record.model_key, `${path}.model_key`);
  const variants = readArray(record.variants, `${path}.variants`).map((entry, index) => {
    const variantPath = `${path}.variants[${index}]`;
    const variant = readRecord(entry, variantPath);
    exactKeys(variant, ['variant_key', 'display_name', 'protocols'], variantPath);
    const variantKeyPath = `${variantPath}.variant_key`;
    const variantKey = readRecord(variant.variant_key, variantKeyPath);
    exactKeys(
      variantKey,
      ['catalog_provider_id', 'canonical_model_id', 'variant_id'],
      variantKeyPath
    );
    return {
      variant_key: {
        ...identity(variantKey, variantKeyPath),
        variant_id: readString(variantKey.variant_id, `${variantKeyPath}.variant_id`),
      },
      display_name: readNullableString(variant.display_name, `${variantPath}.display_name`),
      protocols: readStringSet(variant.protocols, `${variantPath}.protocols`),
    };
  });
  assertSortedUnique(
    variants.map((variant) => variant.variant_key.variant_id),
    `${path}.variants`
  );
  const routes = readArray(record.routes, `${path}.routes`).map((entry, index) =>
    parseInventoryRoute(entry, `${path}.routes[${index}]`)
  );
  assertSortedUnique(
    routes.map((route) => route.route_key.route_channel),
    `${path}.routes`
  );
  for (const variant of variants) {
    if (modelKey(variant.variant_key) !== modelKey(modelIdentity)) {
      fail(`${path}.variants`, 'must contain only variants owned by the parent ModelKey');
    }
  }
  for (const route of routes) {
    if (modelKey(route.route_key) !== modelKey(modelIdentity)) {
      fail(`${path}.routes`, 'must contain only routes owned by the parent ModelKey');
    }
  }
  return {
    model_key: modelIdentity,
    display_name: readString(record.display_name, `${path}.display_name`),
    active: readBoolean(record.active, `${path}.active`),
    variants,
    routes,
  };
}

function parseCatalogBenchmark(value: unknown, path: string): ModelPipelineCatalogBenchmark {
  const record = readRecord(value, path);
  exactKeys(
    record,
    ['name', 'score', 'metric', 'source', 'dataset', 'date', 'harness', 'variant', 'version'],
    path
  );
  return {
    name: readString(record.name, `${path}.name`),
    score: readDecimal(record.score, `${path}.score`, true),
    metric: readNullableString(record.metric, `${path}.metric`),
    source: readNullableString(record.source, `${path}.source`),
    dataset: readNullableString(record.dataset, `${path}.dataset`),
    date: readNullableString(record.date, `${path}.date`),
    harness: readNullableString(record.harness, `${path}.harness`),
    variant: readNullableString(record.variant, `${path}.variant`),
    version: readNullableString(record.version, `${path}.version`),
  };
}

function parseCatalogVariant(value: unknown, path: string): ModelPipelineCatalogVariant {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'catalog_provider_id',
      'canonical_model_id',
      'variant_id',
      'display_name',
      'reasoning_option',
      'own_capabilities',
      'inherited_capabilities',
      'source_id',
    ],
    path
  );
  const ownCapabilities = readStringSet(record.own_capabilities, `${path}.own_capabilities`);
  const inheritedCapabilities = readStringSet(
    record.inherited_capabilities,
    `${path}.inherited_capabilities`
  );
  if (ownCapabilities.some((capability) => inheritedCapabilities.includes(capability))) {
    fail(path, 'cannot declare one capability as both own and inherited');
  }
  return {
    ...identity(record, path),
    variant_id: readString(record.variant_id, `${path}.variant_id`),
    display_name: readNullableString(record.display_name, `${path}.display_name`),
    reasoning_option: readNullableString(record.reasoning_option, `${path}.reasoning_option`),
    own_capabilities: ownCapabilities,
    inherited_capabilities: inheritedCapabilities,
    source_id: readString(record.source_id, `${path}.source_id`),
  };
}

function readNullableBoolean(value: unknown, path: string): boolean | null {
  return value === null ? null : readBoolean(value, path);
}

function readNullableSignedInteger(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return fail(path, 'must be null or a safe whole number');
  }
  return value;
}

function parseLimits(value: unknown, path: string): ModelPipelineLimits {
  const record = readRecord(value, path);
  exactKeys(record, ['context', 'input', 'output'], path);
  const context = readInteger(record.context, `${path}.context`, 1);
  const input = readNullableInteger(record.input, `${path}.input`, 1);
  const output = readInteger(record.output, `${path}.output`, 1);
  if (input !== null && input > context) fail(`${path}.input`, 'must not exceed context');
  if (output > context) fail(`${path}.output`, 'must not exceed context');
  return { context, input, output };
}

function parseModalities(value: unknown, path: string): ModelPipelineModalities {
  const record = readRecord(value, path);
  exactKeys(record, ['input', 'output'], path);
  return {
    input: readStringSet(record.input, `${path}.input`),
    output: readStringSet(record.output, `${path}.output`),
  };
}

function parseCapabilities(value: unknown, path: string): ModelPipelineCapabilities {
  const record = readRecord(value, path);
  exactKeys(
    record,
    ['attachment', 'reasoning', 'structured_output', 'temperature', 'tool_call', 'open_weights'],
    path
  );
  return {
    attachment: readNullableBoolean(record.attachment, `${path}.attachment`),
    reasoning: readNullableBoolean(record.reasoning, `${path}.reasoning`),
    structured_output: readNullableBoolean(record.structured_output, `${path}.structured_output`),
    temperature: readNullableBoolean(record.temperature, `${path}.temperature`),
    tool_call: readNullableBoolean(record.tool_call, `${path}.tool_call`),
    open_weights: readNullableBoolean(record.open_weights, `${path}.open_weights`),
  };
}

function parseReasoningOptions(
  value: unknown,
  path: string
): readonly ModelPipelineReasoningOption[] {
  const options = readArray(value, path).map((entry, index) => {
    const optionPath = `${path}[${index}]`;
    const record = readRecord(entry, optionPath);
    exactKeys(record, ['type', 'values', 'min', 'max'], optionPath);
    const values = readArray(record.values, `${optionPath}.values`).map((item, valueIndex) =>
      readNullableString(item, `${optionPath}.values[${valueIndex}]`)
    );
    if (new Set(values).size !== values.length) {
      fail(`${optionPath}.values`, 'must contain unique values');
    }
    const minimum = readNullableSignedInteger(record.min, `${optionPath}.min`);
    const maximum = readNullableSignedInteger(record.max, `${optionPath}.max`);
    if (minimum !== null && maximum !== null && minimum > maximum) {
      fail(optionPath, 'min must not exceed max');
    }
    return {
      type: readString(record.type, `${optionPath}.type`),
      values,
      min: minimum,
      max: maximum,
    };
  });
  assertSortedUnique(
    options.map((option) => option.type),
    path
  );
  return options;
}

function parseCatalogRoute(value: unknown, path: string): ModelPipelineCatalogRoute {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'route_key',
      'catalog_route_provider_id',
      'catalog_route_model_id',
      'source_id',
      'display_name',
      'status',
      'release_date',
      'last_updated',
      'knowledge_cutoff',
      'limits',
      'modalities',
      'capabilities',
      'reasoning_options',
      'pricing',
    ],
    path
  );
  return {
    route_key: parseNestedRouteKey(record.route_key, `${path}.route_key`),
    catalog_route_provider_id: readString(
      record.catalog_route_provider_id,
      `${path}.catalog_route_provider_id`
    ),
    catalog_route_model_id: readString(
      record.catalog_route_model_id,
      `${path}.catalog_route_model_id`
    ),
    source_id: readString(record.source_id, `${path}.source_id`),
    display_name: readString(record.display_name, `${path}.display_name`),
    status: readNullableString(record.status, `${path}.status`),
    release_date: readNullableString(record.release_date, `${path}.release_date`),
    last_updated: readNullableString(record.last_updated, `${path}.last_updated`),
    knowledge_cutoff: readNullableString(record.knowledge_cutoff, `${path}.knowledge_cutoff`),
    limits: parseLimits(record.limits, `${path}.limits`),
    modalities: parseModalities(record.modalities, `${path}.modalities`),
    capabilities: parseCapabilities(record.capabilities, `${path}.capabilities`),
    reasoning_options: parseReasoningOptions(record.reasoning_options, `${path}.reasoning_options`),
    pricing: record.pricing === null ? null : parsePricing(record.pricing, `${path}.pricing`),
  };
}

function parseCatalogModel(value: unknown, path: string): ModelPipelineCatalogModel {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'catalog_provider_id',
      'canonical_model_id',
      'display_name',
      'family',
      'source_id',
      'status',
      'release_date',
      'last_updated',
      'knowledge_cutoff',
      'limits',
      'modalities',
      'capabilities',
      'reasoning_options',
      'benchmarks',
      'variants',
      'routes',
    ],
    path
  );
  const modelIdentity = identity(record, path);
  const benchmarks = readArray(record.benchmarks, `${path}.benchmarks`).map((entry, index) =>
    parseCatalogBenchmark(entry, `${path}.benchmarks[${index}]`)
  );
  const benchmarkKeys = benchmarks.map((item) =>
    JSON.stringify([
      item.name,
      item.metric ?? '',
      item.variant ?? '',
      item.version ?? '',
      item.dataset ?? '',
      item.date ?? '',
      item.harness ?? '',
      item.source ?? '',
      item.score,
    ])
  );
  const expectedBenchmarkKeys = [...new Set(benchmarkKeys)].sort();
  if (
    benchmarkKeys.length !== expectedBenchmarkKeys.length ||
    benchmarkKeys.some((key, index) => key !== expectedBenchmarkKeys[index])
  ) {
    fail(`${path}.benchmarks`, 'must be unique and canonically sorted');
  }
  const variants = readArray(record.variants, `${path}.variants`).map((entry, index) =>
    parseCatalogVariant(entry, `${path}.variants[${index}]`)
  );
  assertSortedUnique(
    variants.map((item) => item.variant_id),
    `${path}.variants`
  );
  for (const variant of variants) {
    if (modelKey(variant) !== modelKey(modelIdentity)) {
      fail(`${path}.variants`, 'must contain only variants owned by the parent ModelKey');
    }
  }
  const routes = readArray(record.routes, `${path}.routes`).map((entry, index) =>
    parseCatalogRoute(entry, `${path}.routes[${index}]`)
  );
  const routeKeys = routes.map(
    (route) =>
      `${route.route_key.route_channel}\u0000${route.catalog_route_provider_id}\u0000${route.catalog_route_model_id}`
  );
  const expectedRouteKeys = [...new Set(routeKeys)].sort();
  if (
    routeKeys.length !== expectedRouteKeys.length ||
    routeKeys.some((key, index) => key !== expectedRouteKeys[index])
  ) {
    fail(`${path}.routes`, 'must be unique and canonically sorted');
  }
  for (const route of routes) {
    if (modelKey(route.route_key) !== modelKey(modelIdentity)) {
      fail(`${path}.routes`, 'must contain only routes owned by the parent ModelKey');
    }
  }
  return {
    ...modelIdentity,
    display_name: readString(record.display_name, `${path}.display_name`),
    family: readNullableString(record.family, `${path}.family`),
    source_id: readString(record.source_id, `${path}.source_id`),
    status: readNullableString(record.status, `${path}.status`),
    release_date: readNullableString(record.release_date, `${path}.release_date`),
    last_updated: readNullableString(record.last_updated, `${path}.last_updated`),
    knowledge_cutoff: readNullableString(record.knowledge_cutoff, `${path}.knowledge_cutoff`),
    limits: parseLimits(record.limits, `${path}.limits`),
    modalities: parseModalities(record.modalities, `${path}.modalities`),
    capabilities: parseCapabilities(record.capabilities, `${path}.capabilities`),
    reasoning_options: parseReasoningOptions(record.reasoning_options, `${path}.reasoning_options`),
    benchmarks,
    variants,
    routes,
  };
}

function parseObservation(value: unknown, path: string): ModelPipelineObservation {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'catalog_provider_id',
      'canonical_model_id',
      'route_channel',
      'variant_id',
      'protocol',
      'observed_at',
      'outcome',
      'http_status',
      'latency_ms',
      'effective_model_id',
      'effective_variant_id',
      'credential_ref',
      'quota_domain',
      'rejection_reason',
    ],
    path
  );
  const outcome = readString(record.outcome, `${path}.outcome`);
  const credentialReference =
    record.credential_ref === null
      ? null
      : parseCredentialReference(record.credential_ref, `${path}.credential_ref`);
  const quotaDomain = readNullableString(record.quota_domain, `${path}.quota_domain`);
  if (outcome === 'success' && (credentialReference === null) !== (quotaDomain === null)) {
    fail(path, 'credential_ref and quota_domain must be both absent or both present');
  }
  if (outcome === 'success' && credentialReference === null) {
    fail(path, 'successful probe requires credential_ref and quota_domain evidence');
  }
  const effectiveModelId = readNullableString(
    record.effective_model_id,
    `${path}.effective_model_id`
  );
  if (outcome === 'success' && effectiveModelId === null) {
    fail(path, 'successful probe requires effective_model_id evidence');
  }
  const variantId = readNullableString(record.variant_id, `${path}.variant_id`);
  const hasEffectiveVariantId = record.effective_variant_id !== undefined;
  const effectiveVariantId = !hasEffectiveVariantId
    ? null
    : readNullableString(record.effective_variant_id, `${path}.effective_variant_id`);
  if (outcome === 'success' && effectiveVariantId !== variantId) {
    fail(path, 'successful probe effective variant must match ObservationKey');
  }
  return {
    ...routeIdentity(record, path),
    variant_id: variantId,
    protocol: readString(record.protocol, `${path}.protocol`),
    observed_at: readUtcTimestamp(record.observed_at, `${path}.observed_at`),
    outcome,
    http_status: readNullableInteger(record.http_status, `${path}.http_status`, 100, 599),
    latency_ms: readNullableInteger(record.latency_ms, `${path}.latency_ms`, 0),
    effective_model_id: effectiveModelId,
    ...(hasEffectiveVariantId ? { effective_variant_id: effectiveVariantId } : {}),
    credential_ref: credentialReference,
    quota_domain: quotaDomain,
    rejection_reason: readNullableString(record.rejection_reason, `${path}.rejection_reason`),
  };
}

function parseRuleEvaluation(value: unknown, path: string): ModelPipelineRuleEvaluation {
  const record = readRecord(value, path);
  exactKeys(record, ['rule_id', 'config_path', 'passed', 'reason'], path);
  return {
    rule_id: readString(record.rule_id, `${path}.rule_id`),
    config_path: readString(record.config_path, `${path}.config_path`),
    passed: readBoolean(record.passed, `${path}.passed`),
    reason: readString(record.reason, `${path}.reason`),
  };
}

function parseEvaluationMetric(value: unknown, path: string): ModelPipelineEvaluationMetric {
  const record = readRecord(value, path);
  exactKeys(record, ['name', 'value', 'source'], path);
  return {
    name: readString(record.name, `${path}.name`),
    value: readDecimal(record.value, `${path}.value`, true),
    source: readString(record.source, `${path}.source`),
  };
}

function parseEvaluation(value: unknown, path: string): ModelPipelineCandidateEvaluation {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'catalog_provider_id',
      'canonical_model_id',
      'route_channel',
      'variant_id',
      'tier_id',
      'eligible',
      'score',
      'metrics',
      'rules',
    ],
    path
  );
  const metrics = readArray(record.metrics, `${path}.metrics`).map((entry, index) =>
    parseEvaluationMetric(entry, `${path}.metrics[${index}]`)
  );
  assertSortedUnique(
    metrics.map((item) => item.name),
    `${path}.metrics`
  );
  const rules = readArray(record.rules, `${path}.rules`).map((entry, index) =>
    parseRuleEvaluation(entry, `${path}.rules[${index}]`)
  );
  assertSortedUnique(
    rules.map((item) => item.rule_id),
    `${path}.rules`
  );
  const eligible = readBoolean(record.eligible, `${path}.eligible`);
  const score = record.score === null ? null : readDecimal(record.score, `${path}.score`, true);
  if (eligible !== rules.every((rule) => rule.passed)) {
    fail(`${path}.eligible`, 'must equal the configured rule results');
  }
  if (eligible !== (score !== null)) {
    fail(`${path}.score`, 'must exist exactly when the candidate is eligible');
  }
  return {
    ...routeIdentity(record, path),
    variant_id: readNullableString(record.variant_id, `${path}.variant_id`),
    tier_id: readString(record.tier_id, `${path}.tier_id`),
    eligible,
    score,
    metrics,
    rules,
  };
}

function parseRejection(value: unknown, path: string): ModelPipelineCandidateRejection {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'catalog_provider_id',
      'canonical_model_id',
      'route_channel',
      'variant_id',
      'tier_id',
      'rule_id',
      'config_path',
      'reason',
    ],
    path
  );
  return {
    ...routeIdentity(record, path),
    variant_id: readNullableString(record.variant_id, `${path}.variant_id`),
    tier_id: readString(record.tier_id, `${path}.tier_id`),
    rule_id: readString(record.rule_id, `${path}.rule_id`),
    config_path: readString(record.config_path, `${path}.config_path`),
    reason: readString(record.reason, `${path}.reason`),
  };
}

function parseCandidate(value: unknown, path: string): ModelPipelineCandidate {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'catalog_provider_id',
      'canonical_model_id',
      'route_channel',
      'variant_id',
      'catalog_route_provider_id',
      'catalog_route_model_id',
      'runtime_model_id',
      'route_selector',
      'rank',
      'quota_domains',
      'credential_refs',
      'protocols',
      'health',
      'restrictions',
      'pricing',
      'selection_reason',
    ],
    path
  );
  const quotaDomains = readStringSet(record.quota_domains, `${path}.quota_domains`);
  if (quotaDomains.length === 0) fail(`${path}.quota_domains`, 'must not be empty');
  const credentialReferences = readArray(record.credential_refs, `${path}.credential_refs`).map(
    (entry, index) => parseCredentialReference(entry, `${path}.credential_refs[${index}]`)
  );
  assertSortedUnique(
    credentialReferences.map((reference) => reference.id),
    `${path}.credential_refs`
  );
  if (credentialReferences.length === 0) fail(`${path}.credential_refs`, 'must not be empty');
  const protocols = readStringSet(record.protocols, `${path}.protocols`);
  if (protocols.length === 0) fail(`${path}.protocols`, 'must not be empty');
  return {
    ...routeIdentity(record, path),
    variant_id: readNullableString(record.variant_id, `${path}.variant_id`),
    catalog_route_provider_id: readString(
      record.catalog_route_provider_id,
      `${path}.catalog_route_provider_id`
    ),
    catalog_route_model_id: readString(
      record.catalog_route_model_id,
      `${path}.catalog_route_model_id`
    ),
    runtime_model_id: readString(record.runtime_model_id, `${path}.runtime_model_id`),
    route_selector: readDigest(record.route_selector, `${path}.route_selector`),
    rank: readInteger(record.rank, `${path}.rank`, 1),
    quota_domains: quotaDomains,
    credential_refs: credentialReferences,
    protocols,
    health: parseHealth(record.health, `${path}.health`),
    restrictions: parseRestrictions(record.restrictions, `${path}.restrictions`),
    pricing: record.pricing === null ? null : parsePricing(record.pricing, `${path}.pricing`),
    selection_reason: readString(record.selection_reason, `${path}.selection_reason`),
  };
}

function parseAssignment(value: unknown, path: string): ModelPipelineAssignment {
  const record = readRecord(value, path);
  exactKeys(record, ['tier_id', 'alias', 'selectable', 'reason', 'candidates'], path);
  const candidates = readArray(record.candidates, `${path}.candidates`).map((entry, index) =>
    parseCandidate(entry, `${path}.candidates[${index}]`)
  );
  const candidateIds = candidates.map(candidateKey);
  if (new Set(candidateIds).size !== candidateIds.length) {
    fail(`${path}.candidates`, 'must contain unique CandidateKey values');
  }
  candidates.forEach((candidate, index) => {
    if (candidate.rank !== index + 1) {
      fail(`${path}.candidates[${index}].rank`, 'must be contiguous and ordered from 1');
    }
  });
  const selectable = readBoolean(record.selectable, `${path}.selectable`);
  if (selectable !== candidates.length > 0) {
    fail(`${path}.selectable`, 'must reflect whether candidates are available');
  }
  return {
    tier_id: readString(record.tier_id, `${path}.tier_id`),
    alias: readString(record.alias, `${path}.alias`),
    selectable,
    reason: readString(record.reason, `${path}.reason`),
    candidates,
  };
}

function parseAgentBinding(value: unknown, path: string): ModelPipelineAgentBinding {
  const record = readRecord(value, path);
  exactKeys(record, ['agent', 'tier_id', 'alias'], path);
  return {
    agent: readString(record.agent, `${path}.agent`),
    tier_id: readString(record.tier_id, `${path}.tier_id`),
    alias: readString(record.alias, `${path}.alias`),
  };
}

const FAILURE_KINDS = new Set<ModelPipelineFailureKind>([
  'credential',
  'transport',
  'upstream_timeout',
  'empty_pre_response',
]);

function parseFailoverRule(value: unknown, path: string): ModelPipelineFailoverRule {
  const record = readRecord(value, path);
  exactKeys(record, ['rule_id', 'http_statuses', 'error_codes', 'failure_kinds'], path);
  const httpStatuses = readIntegerSet(record.http_statuses, `${path}.http_statuses`, 100, 599);
  const errorCodes = readStringSet(record.error_codes, `${path}.error_codes`);
  const failureKinds = readStringSet(record.failure_kinds, `${path}.failure_kinds`).map(
    (failureKind, index) => {
      if (!FAILURE_KINDS.has(failureKind as ModelPipelineFailureKind)) {
        fail(`${path}.failure_kinds[${index}]`, 'must be a supported failure kind');
      }
      return failureKind as ModelPipelineFailureKind;
    }
  );
  if (httpStatuses.length === 0 && errorCodes.length === 0 && failureKinds.length === 0) {
    fail(path, 'must declare at least one matcher');
  }
  return {
    rule_id: readString(record.rule_id, `${path}.rule_id`),
    http_statuses: httpStatuses,
    error_codes: errorCodes,
    failure_kinds: failureKinds,
  };
}

function parseFailurePolicy(value: unknown, path: string): ModelPipelineFailurePolicy {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'mode',
      'credential_acquisition_timeout_seconds',
      'automatic_retry',
      'automatic_failover',
      'max_candidate_attempts',
      'failover_rules',
      'serve_stale_on_error',
      'preserve_first_error',
      'terminate_owned_request_on_cancel',
    ],
    path
  );
  const mode = readString(record.mode, `${path}.mode`);
  const automaticRetry = readBoolean(record.automatic_retry, `${path}.automatic_retry`);
  const automaticFailover = readBoolean(record.automatic_failover, `${path}.automatic_failover`);
  const serveStaleOnError = readBoolean(
    record.serve_stale_on_error,
    `${path}.serve_stale_on_error`
  );
  const preserveFirstError = readBoolean(
    record.preserve_first_error,
    `${path}.preserve_first_error`
  );
  const terminateOwnedRequestOnCancel = readBoolean(
    record.terminate_owned_request_on_cancel,
    `${path}.terminate_owned_request_on_cancel`
  );
  const failoverRules = readArray(record.failover_rules, `${path}.failover_rules`).map(
    (rule, index) => parseFailoverRule(rule, `${path}.failover_rules[${index}]`)
  );
  if (mode !== 'classified_candidate_failover') {
    fail(`${path}.mode`, 'must equal classified_candidate_failover');
  }
  if (automaticRetry) fail(`${path}.automatic_retry`, 'must be false');
  if (!automaticFailover) fail(`${path}.automatic_failover`, 'must be true');
  if (failoverRules.length === 0) fail(`${path}.failover_rules`, 'must contain at least one rule');
  if (serveStaleOnError) fail(`${path}.serve_stale_on_error`, 'must be false');
  if (!preserveFirstError) fail(`${path}.preserve_first_error`, 'must be true');
  if (!terminateOwnedRequestOnCancel) {
    fail(`${path}.terminate_owned_request_on_cancel`, 'must be true');
  }
  const ruleIds = failoverRules.map((rule) => rule.rule_id);
  if (ruleIds.length !== new Set(ruleIds).size) {
    fail(`${path}.failover_rules`, 'must contain unique rule ids');
  }
  for (const matcher of ['http_statuses', 'error_codes', 'failure_kinds'] as const) {
    const values: string[] = [];
    for (const rule of failoverRules) {
      for (const value of rule[matcher]) values.push(String(value));
    }
    if (values.length !== new Set(values).size) {
      fail(`${path}.failover_rules`, `${matcher} matchers must belong to exactly one rule`);
    }
  }
  return {
    mode,
    credential_acquisition_timeout_seconds: readInteger(
      record.credential_acquisition_timeout_seconds,
      `${path}.credential_acquisition_timeout_seconds`,
      1
    ),
    automatic_retry: automaticRetry,
    automatic_failover: automaticFailover,
    max_candidate_attempts: readInteger(
      record.max_candidate_attempts,
      `${path}.max_candidate_attempts`,
      2
    ),
    failover_rules: failoverRules,
    serve_stale_on_error: serveStaleOnError,
    preserve_first_error: preserveFirstError,
    terminate_owned_request_on_cancel: terminateOwnedRequestOnCancel,
  };
}

function parsePublication(value: unknown, path: string): ModelPipelinePublication {
  const record = readRecord(value, path);
  exactKeys(record, ['mode', 'request_timeout_seconds', 'retained_snapshots', 'targets'], path);
  const targets = readArray(record.targets, `${path}.targets`).map((entry, index) => {
    const targetPath = `${path}.targets[${index}]`;
    const target = readRecord(entry, targetPath);
    exactKeys(target, ['target_id', 'format', 'location', 'required'], targetPath);
    return {
      target_id: readString(target.target_id, `${targetPath}.target_id`),
      format: readString(target.format, `${targetPath}.format`),
      location: readString(target.location, `${targetPath}.location`),
      required: readBoolean(target.required, `${targetPath}.required`),
    };
  });
  assertSortedUnique(
    targets.map((target) => target.target_id),
    `${path}.targets`
  );
  return {
    mode: readString(record.mode, `${path}.mode`),
    request_timeout_seconds: readInteger(
      record.request_timeout_seconds,
      `${path}.request_timeout_seconds`,
      1
    ),
    retained_snapshots: readInteger(record.retained_snapshots, `${path}.retained_snapshots`, 1),
    targets,
  };
}

function parseInventory(value: unknown, path: string): ModelPipelineInventory {
  const record = readRecord(value, path);
  exactKeys(
    record,
    ['schema_version', 'generated_at', 'active', 'binary_provenance', 'models'],
    path
  );
  const schemaVersion = readInteger(record.schema_version, `${path}.schema_version`, 1);
  if (schemaVersion !== MODEL_PIPELINE_SCHEMA_VERSION) {
    fail(`${path}.schema_version`, `must equal ${MODEL_PIPELINE_SCHEMA_VERSION}`);
  }
  let active: ModelPipelineInventoryActive | null = null;
  if (record.active !== null) {
    const activePath = `${path}.active`;
    const activeRecord = readRecord(record.active, activePath);
    exactKeys(
      activeRecord,
      ['generation', 'snapshot_digest', 'projection_digest', 'loaded_at'],
      activePath
    );
    active = {
      generation: readInteger(activeRecord.generation, `${activePath}.generation`, 1),
      snapshot_digest: readDigest(activeRecord.snapshot_digest, `${activePath}.snapshot_digest`),
      projection_digest: readDigest(
        activeRecord.projection_digest,
        `${activePath}.projection_digest`
      ),
      loaded_at: readUtcTimestamp(activeRecord.loaded_at, `${activePath}.loaded_at`),
    };
  }
  const provenancePath = `${path}.binary_provenance`;
  const provenance = readRecord(record.binary_provenance, provenancePath);
  exactKeys(provenance, ['version', 'commit', 'built_at'], provenancePath);
  const models = readArray(record.models, `${path}.models`).map((entry, index) =>
    parseInventoryModel(entry, `${path}.models[${index}]`)
  );
  assertSortedUniqueByKey(
    models,
    models.map((model) => modelKey(model.model_key)),
    `${path}.models`
  );
  const routeSelectors = models.flatMap((model) =>
    model.routes.map((route) => route.route_selector)
  );
  if (new Set(routeSelectors).size !== routeSelectors.length) {
    fail(`${path}.models`, 'must contain globally unique route_selectors');
  }
  return {
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    generated_at: readUtcTimestamp(record.generated_at, `${path}.generated_at`),
    active,
    binary_provenance: {
      version: readString(provenance.version, `${provenancePath}.version`),
      commit: readString(provenance.commit, `${provenancePath}.commit`),
      built_at: readUtcTimestamp(provenance.built_at, `${provenancePath}.built_at`),
    },
    models,
  };
}

function assertSortedUniqueByKey(
  values: readonly unknown[],
  keys: readonly string[],
  path: string
): void {
  const expected = [...new Set(keys)].sort();
  if (values.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(path, 'must be unique and sorted by identity');
  }
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalJsonValue(record[key])])
  );
}

function sha256(value: unknown): string {
  const canonicalJson = JSON.stringify(canonicalJsonValue(value));
  return `sha256:${createHash('sha256').update(canonicalJson).digest('hex')}`;
}

function parseSnapshot(value: unknown, path: string): ModelPipelineSnapshot {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'schema_version',
      'generation',
      'generated_at',
      'source_digests',
      'inventory',
      'catalog',
      'observations',
      'evaluations',
      'rejections',
      'assignments',
      'agent_bindings',
      'failure_policy',
      'publication',
      'projection_digest',
      'snapshot_digest',
    ],
    path
  );
  const schemaVersion = readInteger(record.schema_version, `${path}.schema_version`, 1);
  if (schemaVersion !== MODEL_PIPELINE_SCHEMA_VERSION) {
    fail(`${path}.schema_version`, `must equal ${MODEL_PIPELINE_SCHEMA_VERSION}`);
  }
  const sourceDigests = readArray(record.source_digests, `${path}.source_digests`).map(
    (entry, index) => parseSourceDigest(entry, `${path}.source_digests[${index}]`)
  );
  assertSortedUnique(
    sourceDigests.map((item) => item.source_id),
    `${path}.source_digests`
  );
  const inventory = parseInventory(record.inventory, `${path}.inventory`);
  const catalog = readArray(record.catalog, `${path}.catalog`).map((entry, index) =>
    parseCatalogModel(entry, `${path}.catalog[${index}]`)
  );
  assertSortedUniqueByKey(catalog, catalog.map(modelKey), `${path}.catalog`);
  const observations = readArray(record.observations, `${path}.observations`).map((entry, index) =>
    parseObservation(entry, `${path}.observations[${index}]`)
  );
  assertSortedUniqueByKey(
    observations,
    observations.map((item) => `${candidateKey(item)}\u0000${item.protocol}`),
    `${path}.observations`
  );
  const routeId = (route: ModelPipelineRouteKey): string =>
    `${modelKey(route)}\u0000${route.route_channel}`;
  const inventoryRoutes = new Map(
    inventory.models.flatMap((model) =>
      model.routes.map((route) => [routeId(route.route_key), route] as const)
    )
  );
  const catalogRoutes = new Map(
    catalog.flatMap((model) =>
      model.routes.map(
        (route) =>
          [
            `${routeId(route.route_key)}\u0000${route.catalog_route_provider_id}\u0000${route.catalog_route_model_id}`,
            route,
          ] as const
      )
    )
  );
  const credentialId = (reference: ModelPipelineCredentialReference): string =>
    `${reference.id}\u0000${reference.kind}`;
  for (const observation of observations) {
    const route = inventoryRoutes.get(routeId(observation));
    if (!route || !route.protocols.includes(observation.protocol)) {
      fail(`${path}.observations`, 'requires a declared inventory route protocol');
    }
    const credentials = new Map(
      route.credentials.map((credential) => [credentialId(credential.credential_ref), credential])
    );
    if (observation.credential_ref !== null) {
      const credential = credentials.get(credentialId(observation.credential_ref));
      if (!credential) {
        fail(`${path}.observations`, 'credential_ref must come from its inventory route');
      }
      if (credential.quota_domain !== observation.quota_domain) {
        fail(`${path}.observations`, 'quota_domain must equal its credential domain');
      }
    }
    if (
      observation.quota_domain !== null &&
      !route.quota_domains.includes(observation.quota_domain)
    ) {
      fail(`${path}.observations`, 'quota_domain must come from its inventory route');
    }
  }
  const evaluations = readArray(record.evaluations, `${path}.evaluations`).map((entry, index) =>
    parseEvaluation(entry, `${path}.evaluations[${index}]`)
  );
  assertSortedUniqueByKey(
    evaluations,
    evaluations.map((item) => `${item.tier_id}\u0000${candidateKey(item)}`),
    `${path}.evaluations`
  );
  for (const evaluation of evaluations) {
    if (!inventoryRoutes.has(routeId(evaluation))) {
      fail(`${path}.evaluations`, 'requires a declared inventory route');
    }
  }
  const rejections = readArray(record.rejections, `${path}.rejections`).map((entry, index) =>
    parseRejection(entry, `${path}.rejections[${index}]`)
  );
  assertSortedUniqueByKey(
    rejections,
    rejections.map((item) => `${item.tier_id}\u0000${candidateKey(item)}\u0000${item.rule_id}`),
    `${path}.rejections`
  );
  const evaluationsByTierCandidate = new Map(
    evaluations.map((evaluation) => [
      `${evaluation.tier_id}\u0000${candidateKey(evaluation)}`,
      evaluation,
    ])
  );
  for (const rejection of rejections) {
    const evaluation = evaluationsByTierCandidate.get(
      `${rejection.tier_id}\u0000${candidateKey(rejection)}`
    );
    if (!evaluation || evaluation.eligible) {
      fail(`${path}.rejections`, 'requires an ineligible evaluation for the same tier');
    }
  }
  const assignments = readArray(record.assignments, `${path}.assignments`).map((entry, index) =>
    parseAssignment(entry, `${path}.assignments[${index}]`)
  );
  assertSortedUnique(
    assignments.map((item) => item.tier_id),
    `${path}.assignments`
  );
  if (new Set(assignments.map((item) => item.alias)).size !== assignments.length) {
    fail(`${path}.assignments`, 'must contain unique aliases');
  }
  const agentBindings = readArray(record.agent_bindings, `${path}.agent_bindings`).map(
    (entry, index) => parseAgentBinding(entry, `${path}.agent_bindings[${index}]`)
  );
  if (agentBindings.length === 0) {
    fail(`${path}.agent_bindings`, 'must contain at least one agent tier binding');
  }
  assertSortedUnique(
    agentBindings.map((binding) => binding.agent),
    `${path}.agent_bindings`
  );
  const aliasesByTier = new Map(
    assignments.map((assignment) => [assignment.tier_id, assignment.alias] as const)
  );
  for (const binding of agentBindings) {
    if (aliasesByTier.get(binding.tier_id) !== binding.alias) {
      fail(`${path}.agent_bindings`, 'must reference the alias allocated to each bound tier');
    }
  }

  const eligible = new Set(
    evaluations
      .filter((item) => item.eligible)
      .map((item) => `${item.tier_id}\u0000${candidateKey(item)}`)
  );
  const tierByModel = new Map<string, string>();
  for (const assignment of assignments) {
    for (const candidate of assignment.candidates) {
      if (!eligible.has(`${assignment.tier_id}\u0000${candidateKey(candidate)}`)) {
        fail(`${path}.assignments`, 'contains a candidate without an eligible evaluation');
      }
      const inventoryRoute = inventoryRoutes.get(routeId(candidate));
      if (!inventoryRoute) {
        fail(`${path}.assignments`, 'contains a candidate without an inventory route');
      }
      const catalogRoute = catalogRoutes.get(
        `${routeId(candidate)}\u0000${candidate.catalog_route_provider_id}\u0000${candidate.catalog_route_model_id}`
      );
      if (!catalogRoute) {
        fail(`${path}.assignments`, 'contains a candidate without a catalog provider route');
      }
      if (
        inventoryRoute.catalog_route_provider_id !== candidate.catalog_route_provider_id ||
        inventoryRoute.catalog_route_model_id !== candidate.catalog_route_model_id ||
        inventoryRoute.runtime_model_id !== candidate.runtime_model_id ||
        inventoryRoute.route_selector !== candidate.route_selector
      ) {
        fail(`${path}.assignments`, 'candidate route facts must equal its inventory route');
      }
      if (
        JSON.stringify(inventoryRoute.health) !== JSON.stringify(candidate.health) ||
        JSON.stringify(inventoryRoute.restrictions) !== JSON.stringify(candidate.restrictions)
      ) {
        fail(`${path}.assignments`, 'candidate observations must equal its inventory route');
      }
      if (JSON.stringify(catalogRoute.pricing) !== JSON.stringify(candidate.pricing)) {
        fail(`${path}.assignments`, 'candidate pricing must equal its catalog route pricing');
      }
      if (
        candidate.quota_domains.some((domain) => !inventoryRoute.quota_domains.includes(domain))
      ) {
        fail(`${path}.assignments`, 'candidate quota_domains must come from its inventory route');
      }
      const credentials = new Map(
        inventoryRoute.credentials.map((credential) => [
          credentialId(credential.credential_ref),
          credential,
        ])
      );
      const selectedDomains = new Set<string>();
      for (const reference of candidate.credential_refs) {
        const credential = credentials.get(credentialId(reference));
        if (!credential) {
          fail(`${path}.assignments`, 'candidate credential_refs must come from its route');
        }
        selectedDomains.add(credential.quota_domain);
      }
      if (
        selectedDomains.size !== candidate.quota_domains.length ||
        candidate.quota_domains.some((domain) => !selectedDomains.has(domain))
      ) {
        fail(`${path}.assignments`, 'candidate quota_domains must equal credential domains');
      }
      if (candidate.protocols.some((protocol) => !inventoryRoute.protocols.includes(protocol))) {
        fail(`${path}.assignments`, 'candidate protocols must come from its inventory route');
      }
      const key = modelKey(candidate);
      const previousTier = tierByModel.get(key);
      if (previousTier && previousTier !== assignment.tier_id) {
        fail(`${path}.assignments`, 'assigns one ModelKey to more than one tier');
      }
      tierByModel.set(key, assignment.tier_id);
    }
  }

  const semanticSnapshot = {
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    generation: readInteger(record.generation, `${path}.generation`, 1),
    generated_at: readUtcTimestamp(record.generated_at, `${path}.generated_at`),
    source_digests: sourceDigests,
    inventory,
    catalog,
    observations,
    evaluations,
    rejections,
    assignments,
    agent_bindings: agentBindings,
    failure_policy: parseFailurePolicy(record.failure_policy, `${path}.failure_policy`),
    publication: parsePublication(record.publication, `${path}.publication`),
  };
  const projectionDigest = readDigest(record.projection_digest, `${path}.projection_digest`);
  const expectedProjectionDigest = sha256(semanticSnapshot);
  if (projectionDigest !== expectedProjectionDigest) {
    fail(`${path}.projection_digest`, `must equal ${expectedProjectionDigest}`);
  }
  const snapshotWithoutOwnDigest = {
    ...semanticSnapshot,
    projection_digest: projectionDigest,
  };
  const snapshotDigest = readDigest(record.snapshot_digest, `${path}.snapshot_digest`);
  const expectedSnapshotDigest = sha256(snapshotWithoutOwnDigest);
  if (snapshotDigest !== expectedSnapshotDigest) {
    fail(`${path}.snapshot_digest`, `must equal ${expectedSnapshotDigest}`);
  }
  return {
    ...snapshotWithoutOwnDigest,
    snapshot_digest: snapshotDigest,
  };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

export function parseModelPipelineConfig(value: unknown): ModelPipelineConfig {
  const path = 'model_pipeline';
  const record = readRecord(value, path);
  exactKeys(record, ['schema_version', 'snapshot'], path);
  const schemaVersion = readInteger(record.schema_version, `${path}.schema_version`, 1);
  if (schemaVersion !== MODEL_PIPELINE_SCHEMA_VERSION) {
    fail(`${path}.schema_version`, `must equal ${MODEL_PIPELINE_SCHEMA_VERSION}`);
  }
  const snapshot = parseSnapshot(record.snapshot, `${path}.snapshot`);
  if (snapshot.schema_version !== schemaVersion) {
    fail(`${path}.schema_version`, 'must match snapshot.schema_version');
  }
  return deepFreeze({
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    snapshot,
  });
}

export function parseModelPipelineInventory(value: unknown): ModelPipelineInventory {
  return deepFreeze(parseInventory(value, 'model_inventory'));
}

export function isModelPipelineConfig(value: unknown): value is ModelPipelineConfig {
  try {
    parseModelPipelineConfig(value);
    return true;
  } catch {
    return false;
  }
}
