import {
  assertSortedUnique,
  exactKeys,
  fail,
  modelKey,
  parseCredentialReference,
  parseHealth,
  parseNestedModelKey,
  parseNestedRouteKey,
  parseNestedVariantKey,
  parseRestrictions,
  readArray,
  readBoolean,
  readDecimal,
  readDigest,
  readInteger,
  readNullableBoolean,
  readNullableInteger,
  readNullableSignedInteger,
  readNullableString,
  readRecord,
  readString,
  readStringSet,
  readUtcTimestamp,
} from './model-pipeline-codec';
import { MODEL_PIPELINE_INVENTORY_SCHEMA_VERSION } from './model-pipeline-types';
import type {
  ModelPipelineCapabilities,
  ModelPipelineCatalogBenchmark,
  ModelPipelineCatalogVariant,
  ModelPipelineInventoryCredential,
  ModelPipelineInventoryModel,
  ModelPipelineInventoryRoute,
  ModelPipelineLimits,
  ModelPipelineModalities,
  ModelPipelineReasoningOption,
} from './model-pipeline-types';

function parseInventoryCredential(value: unknown, path: string): ModelPipelineInventoryCredential {
  const record = readRecord(value, path);
  exactKeys(
    record,
    ['credential_ref', 'quota_domain', 'health', 'quota', 'suspension', 'restrictions'],
    path,
    MODEL_PIPELINE_INVENTORY_SCHEMA_VERSION
  );
  const credentialPath = `${path}.credential_ref`;
  const quotaPath = `${path}.quota`;
  const quota = readRecord(record.quota, quotaPath);
  exactKeys(
    quota,
    ['status', 'remaining', 'resets_at', 'reason'],
    quotaPath,
    MODEL_PIPELINE_INVENTORY_SCHEMA_VERSION
  );
  if (quota.status !== 'available' && quota.status !== 'blocked' && quota.status !== 'unknown') {
    fail(`${quotaPath}.status`, 'must be available, blocked, or unknown');
  }
  const suspensionPath = `${path}.suspension`;
  const suspension = readRecord(record.suspension, suspensionPath);
  exactKeys(
    suspension,
    ['active', 'reason', 'resumes_at'],
    suspensionPath,
    MODEL_PIPELINE_INVENTORY_SCHEMA_VERSION
  );
  const suspensionActive = readBoolean(suspension.active, `${suspensionPath}.active`);
  const suspensionReason = readNullableString(suspension.reason, `${suspensionPath}.reason`);
  if (suspensionActive && suspensionReason === null) {
    fail(`${suspensionPath}.reason`, 'is required for an active suspension');
  }
  return {
    credential_ref: parseCredentialReference(record.credential_ref, credentialPath),
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
    path,
    MODEL_PIPELINE_INVENTORY_SCHEMA_VERSION
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
  const health = parseHealth(record.health, `${path}.health`);
  const restrictions = parseRestrictions(record.restrictions, `${path}.restrictions`);
  const selectable = readBoolean(record.selectable, `${path}.selectable`);
  const credentialSelectable = (credential: ModelPipelineInventoryCredential): boolean =>
    credential.health.selectable &&
    credential.quota.status === 'available' &&
    !credential.suspension.active &&
    credential.restrictions.every((restriction) => !restriction.active);
  if (
    selectable &&
    (!health.selectable ||
      restrictions.some((restriction) => restriction.active) ||
      !credentials.some(credentialSelectable))
  ) {
    fail(
      path,
      'selectable route requires selectable health, no active restriction, and a usable credential'
    );
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
    restrictions,
    health,
    selectable,
    selection_reason: readString(record.selection_reason, `${path}.selection_reason`),
    credentials,
  };
}

export function parseInventoryModel(value: unknown, path: string): ModelPipelineInventoryModel {
  const record = readRecord(value, path);
  exactKeys(
    record,
    ['model_key', 'display_name', 'active', 'variants', 'routes'],
    path,
    MODEL_PIPELINE_INVENTORY_SCHEMA_VERSION
  );
  const modelIdentity = parseNestedModelKey(record.model_key, `${path}.model_key`);
  const variants = readArray(record.variants, `${path}.variants`).map((entry, index) => {
    const variantPath = `${path}.variants[${index}]`;
    const variant = readRecord(entry, variantPath);
    exactKeys(
      variant,
      ['variant_key', 'display_name', 'protocols'],
      variantPath,
      MODEL_PIPELINE_INVENTORY_SCHEMA_VERSION
    );
    return {
      variant_key: parseNestedVariantKey(variant.variant_key, `${variantPath}.variant_key`),
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
    if (modelKey(variant.variant_key.model_key) !== modelKey(modelIdentity)) {
      fail(`${path}.variants`, 'must contain only variants owned by the parent ModelKey');
    }
  }
  for (const route of routes) {
    if (modelKey(route.route_key.model_key) !== modelKey(modelIdentity)) {
      fail(`${path}.routes`, 'must contain only routes owned by the parent ModelKey');
    }
  }
  const active = readBoolean(record.active, `${path}.active`);
  if (!active && routes.some((route) => route.selectable)) {
    fail(`${path}.active`, 'inactive model cannot expose a selectable route');
  }
  return {
    model_key: modelIdentity,
    display_name: readString(record.display_name, `${path}.display_name`),
    active,
    variants,
    routes,
  };
}

export function parseCatalogBenchmark(value: unknown, path: string): ModelPipelineCatalogBenchmark {
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

export function parseCatalogVariant(value: unknown, path: string): ModelPipelineCatalogVariant {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'model_key',
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
    model_key: parseNestedModelKey(record.model_key, `${path}.model_key`),
    variant_id: readString(record.variant_id, `${path}.variant_id`),
    display_name: readNullableString(record.display_name, `${path}.display_name`),
    reasoning_option: readNullableString(record.reasoning_option, `${path}.reasoning_option`),
    own_capabilities: ownCapabilities,
    inherited_capabilities: inheritedCapabilities,
    source_id: readString(record.source_id, `${path}.source_id`),
  };
}

export function parseLimits(value: unknown, path: string): ModelPipelineLimits {
  const record = readRecord(value, path);
  exactKeys(record, ['context', 'input', 'output'], path);
  const context = readInteger(record.context, `${path}.context`, 1);
  const input = readNullableInteger(record.input, `${path}.input`, 1);
  const output = readInteger(record.output, `${path}.output`, 1);
  if (input !== null && input > context) fail(`${path}.input`, 'must not exceed context');
  if (output > context) fail(`${path}.output`, 'must not exceed context');
  return { context, input, output };
}

export function parseModalities(value: unknown, path: string): ModelPipelineModalities {
  const record = readRecord(value, path);
  exactKeys(record, ['input', 'output'], path);
  return {
    input: readStringSet(record.input, `${path}.input`),
    output: readStringSet(record.output, `${path}.output`),
  };
}

export function parseCapabilities(value: unknown, path: string): ModelPipelineCapabilities {
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

export function parseReasoningOptions(
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
