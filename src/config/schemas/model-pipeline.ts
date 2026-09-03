import { canonicalJson, canonicalJsonSha256Digest } from '../../utils/canonical-json';

import {
  assertSortedUnique,
  candidateKey,
  exactKeys,
  fail,
  identity,
  modelKey,
  parseCredentialReference,
  parseHealth,
  parseNestedModelKey,
  parseNestedRouteKey,
  parsePricing,
  parseRestrictions,
  parseSourceDigest,
  readArray,
  readBoolean,
  readDecimal,
  readDigest,
  readInteger,
  readIntegerSet,
  readNullableBoolean,
  readNullableInteger,
  readNullableSignedInteger,
  readNullableString,
  readRecord,
  readString,
  readStringSet,
  readStringValue,
  readUtcTimestamp,
} from './model-pipeline-codec';
import {
  parseCapabilities,
  parseCatalogBenchmark,
  parseCatalogVariant,
  parseInventoryModel,
  parseLimits,
  parseModalities,
  parseReasoningOptions,
} from './model-pipeline-sections';

import {
  CLIPROXY_INVENTORY_SCHEMA_VERSION,
  CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION,
  MODEL_PIPELINE_SCHEMA_VERSION,
  type ModelPipelineAgentBinding,
  type ModelPipelineAssignment,
  type ModelPipelineCandidate,
  type ModelPipelineCandidateEvaluation,
  type ModelPipelineCandidateRejection,
  type ModelPipelineCatalogExperimentalMode,
  type ModelPipelineCatalogHeader,
  type ModelPipelineCatalogInterleaved,
  type ModelPipelineCatalogJsonNode,
  type ModelPipelineCatalogJsonPathSegment,
  type ModelPipelineCatalogLink,
  type ModelPipelineCatalogModel,
  type ModelPipelineCatalogProviderRequest,
  type ModelPipelineCatalogRoute,
  type ModelPipelineCatalogWeight,
  type ModelPipelineConfig,
  type ModelPipelineCredentialReference,
  type ModelPipelineEvaluationMetric,
  type ModelPipelineFailoverRule,
  type ModelPipelineFailureKind,
  type ModelPipelineInventory,
  type ModelPipelineInventoryActive,
  type ModelPipelineMember,
  type ModelPipelineObservation,
  type ModelPipelinePublication,
  type ModelPipelineFailurePolicy,
  type ModelPipelineRouteKey,
  type ModelPipelineRuleEvaluation,
  type ModelPipelineSnapshot,
  type ActiveIdentityV2,
  type ModelPipelinePublicationRequest,
  type PublicationReceiptV2,
} from './model-pipeline-types';

export * from './model-pipeline-types';

function parseCatalogLink(value: unknown, path: string): ModelPipelineCatalogLink {
  const record = readRecord(value, path);
  exactKeys(record, ['label', 'url', 'type'], path);
  return {
    label: readNullableString(record.label, `${path}.label`),
    url: readString(record.url, `${path}.url`),
    type: readNullableString(record.type, `${path}.type`),
  };
}

function parseCatalogWeight(value: unknown, path: string): ModelPipelineCatalogWeight {
  const record = readRecord(value, path);
  exactKeys(record, ['label', 'url', 'format', 'quantization'], path);
  return {
    label: readNullableString(record.label, `${path}.label`),
    url: readString(record.url, `${path}.url`),
    format: readNullableString(record.format, `${path}.format`),
    quantization: readNullableString(record.quantization, `${path}.quantization`),
  };
}

function parseCatalogJsonPathSegment(
  value: unknown,
  path: string
): ModelPipelineCatalogJsonPathSegment {
  const record = readRecord(value, path);
  exactKeys(record, ['property_name', 'array_index'], path);
  const propertyName = readNullableString(record.property_name, `${path}.property_name`);
  const arrayIndex = readNullableInteger(record.array_index, `${path}.array_index`, 0);
  if ((propertyName === null) === (arrayIndex === null)) {
    fail(path, 'requires exactly one property_name or array_index');
  }
  return { property_name: propertyName, array_index: arrayIndex };
}

function catalogJsonPathKey(path: readonly ModelPipelineCatalogJsonPathSegment[]): string {
  return path
    .map((segment) =>
      segment.property_name !== null
        ? `p:${segment.property_name}`
        : `i:${String(segment.array_index).padStart(20, '0')}`
    )
    .join('\u0000');
}

function parseCatalogJsonNode(value: unknown, path: string): ModelPipelineCatalogJsonNode {
  const record = readRecord(value, path);
  exactKeys(
    record,
    ['path', 'kind', 'string_value', 'integer_value', 'decimal_value', 'boolean_value'],
    path
  );
  const kind = readString(record.kind, `${path}.kind`);
  if (
    kind !== 'object' &&
    kind !== 'array' &&
    kind !== 'string' &&
    kind !== 'integer' &&
    kind !== 'decimal' &&
    kind !== 'boolean' &&
    kind !== 'null'
  ) {
    fail(`${path}.kind`, 'must identify a supported JSON node kind');
  }
  const stringValue =
    record.string_value === null
      ? null
      : readStringValue(record.string_value, `${path}.string_value`);
  const integerValue = readNullableSignedInteger(record.integer_value, `${path}.integer_value`);
  const decimalValue =
    record.decimal_value === null
      ? null
      : readDecimal(record.decimal_value, `${path}.decimal_value`, true);
  const booleanValue = readNullableBoolean(record.boolean_value, `${path}.boolean_value`);
  const present = {
    string: stringValue !== null,
    integer: integerValue !== null,
    decimal: decimalValue !== null,
    boolean: booleanValue !== null,
  } as const;
  for (const [valueKind, isPresent] of Object.entries(present)) {
    if (isPresent !== (kind === valueKind)) {
      fail(path, `has incoherent ${valueKind}_value for JSON node kind ${kind}`);
    }
  }
  return {
    path: readArray(record.path, `${path}.path`).map((segment, index) =>
      parseCatalogJsonPathSegment(segment, `${path}.path[${index}]`)
    ),
    kind,
    string_value: stringValue,
    integer_value: integerValue,
    decimal_value: decimalValue,
    boolean_value: booleanValue,
  };
}

function parseCatalogHeader(value: unknown, path: string): ModelPipelineCatalogHeader {
  const record = readRecord(value, path);
  exactKeys(record, ['name', 'value'], path);
  return {
    name: readString(record.name, `${path}.name`),
    value: readStringValue(record.value, `${path}.value`),
  };
}

function parseCatalogProviderRequest(
  value: unknown,
  path: string
): ModelPipelineCatalogProviderRequest {
  const record = readRecord(value, path);
  exactKeys(record, ['npm', 'api', 'shape', 'body', 'headers'], path);
  const shape = readNullableString(record.shape, `${path}.shape`);
  if (shape !== null && shape !== 'responses' && shape !== 'completions') {
    fail(`${path}.shape`, 'must be responses, completions, or null');
  }
  const body =
    record.body === null
      ? null
      : readArray(record.body, `${path}.body`).map((entry, index) =>
          parseCatalogJsonNode(entry, `${path}.body[${index}]`)
        );
  if (body !== null) {
    const paths = body.map((node) => catalogJsonPathKey(node.path));
    const expected = [...new Set(paths)].sort();
    if (
      paths.length === 0 ||
      paths.length !== expected.length ||
      paths.some((entry, index) => entry !== expected[index])
    ) {
      fail(`${path}.body`, 'must be non-empty, unique, and sorted by JSON path');
    }
  }
  const headers =
    record.headers === null
      ? null
      : readArray(record.headers, `${path}.headers`).map((entry, index) =>
          parseCatalogHeader(entry, `${path}.headers[${index}]`)
        );
  if (headers !== null) {
    assertSortedUnique(
      headers.map((header) => header.name),
      `${path}.headers`
    );
  }
  return {
    npm: readNullableString(record.npm, `${path}.npm`),
    api: readNullableString(record.api, `${path}.api`),
    shape,
    body,
    headers,
  };
}

function parseCatalogInterleaved(value: unknown, path: string): ModelPipelineCatalogInterleaved {
  const record = readRecord(value, path);
  exactKeys(record, ['enabled', 'field'], path);
  if (record.enabled !== true) fail(`${path}.enabled`, 'must be true');
  const field = readNullableString(record.field, `${path}.field`);
  if (field !== null && field !== 'reasoning_content' && field !== 'reasoning_details') {
    fail(`${path}.field`, 'must be reasoning_content, reasoning_details, or null');
  }
  return { enabled: true, field };
}

function parseCatalogExperimentalMode(
  value: unknown,
  path: string
): ModelPipelineCatalogExperimentalMode {
  const record = readRecord(value, path);
  exactKeys(record, ['name', 'pricing', 'request'], path);
  return {
    name: readString(record.name, `${path}.name`),
    pricing: record.pricing === null ? null : parsePricing(record.pricing, `${path}.pricing`),
    request:
      record.request === null
        ? null
        : parseCatalogProviderRequest(record.request, `${path}.request`),
  };
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
      'provider_name',
      'provider_env',
      'provider_npm',
      'provider_api',
      'provider_doc',
      'display_name',
      'description',
      'family',
      'status',
      'release_date',
      'last_updated',
      'knowledge_cutoff',
      'limits',
      'modalities',
      'capabilities',
      'reasoning_options',
      'interleaved',
      'provider_request',
      'experimental_modes',
      'pricing',
    ],
    path
  );
  const experimentalModes = readArray(record.experimental_modes, `${path}.experimental_modes`).map(
    (entry, index) => parseCatalogExperimentalMode(entry, `${path}.experimental_modes[${index}]`)
  );
  assertSortedUnique(
    experimentalModes.map((mode) => mode.name),
    `${path}.experimental_modes`
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
    provider_name: readString(record.provider_name, `${path}.provider_name`),
    provider_env: readStringSet(record.provider_env, `${path}.provider_env`),
    provider_npm: readString(record.provider_npm, `${path}.provider_npm`),
    provider_api: readNullableString(record.provider_api, `${path}.provider_api`),
    provider_doc: readString(record.provider_doc, `${path}.provider_doc`),
    display_name: readString(record.display_name, `${path}.display_name`),
    description: readString(record.description, `${path}.description`),
    family: readNullableString(record.family, `${path}.family`),
    status: readNullableString(record.status, `${path}.status`),
    release_date: readNullableString(record.release_date, `${path}.release_date`),
    last_updated: readNullableString(record.last_updated, `${path}.last_updated`),
    knowledge_cutoff: readNullableString(record.knowledge_cutoff, `${path}.knowledge_cutoff`),
    limits: parseLimits(record.limits, `${path}.limits`),
    modalities: parseModalities(record.modalities, `${path}.modalities`),
    capabilities: parseCapabilities(record.capabilities, `${path}.capabilities`),
    reasoning_options: parseReasoningOptions(record.reasoning_options, `${path}.reasoning_options`),
    interleaved:
      record.interleaved === null
        ? null
        : parseCatalogInterleaved(record.interleaved, `${path}.interleaved`),
    provider_request:
      record.provider_request === null
        ? null
        : parseCatalogProviderRequest(record.provider_request, `${path}.provider_request`),
    experimental_modes: experimentalModes,
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
      'description',
      'family',
      'license',
      'links',
      'weights',
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
  const links = readArray(record.links, `${path}.links`).map((entry, index) =>
    parseCatalogLink(entry, `${path}.links[${index}]`)
  );
  const linkKeys = links.map((item) =>
    JSON.stringify([item.type ?? '', item.label ?? '', item.url])
  );
  const expectedLinkKeys = [...new Set(linkKeys)].sort();
  if (
    linkKeys.length !== expectedLinkKeys.length ||
    linkKeys.some((key, index) => key !== expectedLinkKeys[index])
  ) {
    fail(`${path}.links`, 'must be unique and canonically sorted');
  }
  const weights = readArray(record.weights, `${path}.weights`).map((entry, index) =>
    parseCatalogWeight(entry, `${path}.weights[${index}]`)
  );
  const weightKeys = weights.map((item) =>
    JSON.stringify([item.format ?? '', item.quantization ?? '', item.label ?? '', item.url])
  );
  const expectedWeightKeys = [...new Set(weightKeys)].sort();
  if (
    weightKeys.length !== expectedWeightKeys.length ||
    weightKeys.some((key, index) => key !== expectedWeightKeys[index])
  ) {
    fail(`${path}.weights`, 'must be unique and canonically sorted');
  }
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
    if (modelKey(variant.model_key) !== modelKey(modelIdentity)) {
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
    if (modelKey(route.route_key.model_key) !== modelKey(modelIdentity)) {
      fail(`${path}.routes`, 'must contain only routes owned by the parent ModelKey');
    }
  }
  return {
    ...modelIdentity,
    display_name: readString(record.display_name, `${path}.display_name`),
    description: readString(record.description, `${path}.description`),
    family: readNullableString(record.family, `${path}.family`),
    license: readNullableString(record.license, `${path}.license`),
    links,
    weights,
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
      'route_key',
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
  const effectiveVariantId = readNullableString(
    record.effective_variant_id,
    `${path}.effective_variant_id`
  );
  if (outcome === 'success' && effectiveVariantId !== variantId) {
    fail(path, 'successful probe effective variant must match ObservationKey');
  }
  return {
    route_key: parseNestedRouteKey(record.route_key, `${path}.route_key`),
    variant_id: variantId,
    protocol: readString(record.protocol, `${path}.protocol`),
    observed_at: readUtcTimestamp(record.observed_at, `${path}.observed_at`),
    outcome,
    http_status: readNullableInteger(record.http_status, `${path}.http_status`, 100, 599),
    latency_ms: readNullableInteger(record.latency_ms, `${path}.latency_ms`, 0),
    effective_model_id: effectiveModelId,
    effective_variant_id: effectiveVariantId,
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
    ['route_key', 'variant_id', 'tier_id', 'eligible', 'score', 'metrics', 'rules'],
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
    route_key: parseNestedRouteKey(record.route_key, `${path}.route_key`),
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
    ['route_key', 'variant_id', 'tier_id', 'rule_id', 'config_path', 'reason'],
    path
  );
  return {
    route_key: parseNestedRouteKey(record.route_key, `${path}.route_key`),
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
      'route_key',
      'variant_id',
      'catalog_route_provider_id',
      'catalog_route_model_id',
      'runtime_model_id',
      'route_selector',
      'route_rank',
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
    route_key: parseNestedRouteKey(record.route_key, `${path}.route_key`),
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
    route_rank: readInteger(record.route_rank, `${path}.route_rank`, 1),
    quota_domains: quotaDomains,
    credential_refs: credentialReferences,
    protocols,
    health: parseHealth(record.health, `${path}.health`),
    restrictions: parseRestrictions(record.restrictions, `${path}.restrictions`),
    pricing: record.pricing === null ? null : parsePricing(record.pricing, `${path}.pricing`),
    selection_reason: readString(record.selection_reason, `${path}.selection_reason`),
  };
}

function parseMember(value: unknown, path: string): ModelPipelineMember {
  const record = readRecord(value, path);
  exactKeys(
    record,
    ['model_key', 'member_rank', 'model_score', 'selection_reason', 'candidates'],
    path
  );
  const model = parseNestedModelKey(record.model_key, `${path}.model_key`);
  const candidates = readArray(record.candidates, `${path}.candidates`).map((entry, index) =>
    parseCandidate(entry, `${path}.candidates[${index}]`)
  );
  if (candidates.length === 0) fail(`${path}.candidates`, 'must not be empty');
  const candidateIds = candidates.map(candidateKey);
  if (new Set(candidateIds).size !== candidateIds.length) {
    fail(`${path}.candidates`, 'must contain unique CandidateKey values');
  }
  candidates.forEach((candidate, index) => {
    if (candidate.route_rank !== index + 1) {
      fail(`${path}.candidates[${index}].route_rank`, 'must be contiguous and ordered from 1');
    }
    if (modelKey(candidate.route_key.model_key) !== modelKey(model)) {
      fail(`${path}.candidates[${index}]`, 'must belong to member.model_key');
    }
  });
  return {
    model_key: model,
    member_rank: readInteger(record.member_rank, `${path}.member_rank`, 1),
    model_score: readDecimal(record.model_score, `${path}.model_score`, true),
    selection_reason: readString(record.selection_reason, `${path}.selection_reason`),
    candidates,
  };
}

function parseAssignment(value: unknown, path: string): ModelPipelineAssignment {
  const record = readRecord(value, path);
  exactKeys(record, ['tier_id', 'alias', 'selectable', 'reason', 'members'], path);
  const members = readArray(record.members, `${path}.members`).map((entry, index) =>
    parseMember(entry, `${path}.members[${index}]`)
  );
  const memberIds = members.map((member) => modelKey(member.model_key));
  if (new Set(memberIds).size !== memberIds.length) {
    fail(`${path}.members`, 'must contain unique ModelKey values');
  }
  members.forEach((member, index) => {
    if (member.member_rank !== index + 1) {
      fail(`${path}.members[${index}].member_rank`, 'must be contiguous and ordered from 1');
    }
  });
  const selectable = readBoolean(record.selectable, `${path}.selectable`);
  if (selectable !== members.length > 0) {
    fail(`${path}.selectable`, 'must reflect whether members are available');
  }
  return {
    tier_id: readString(record.tier_id, `${path}.tier_id`),
    alias: readString(record.alias, `${path}.alias`),
    selectable,
    reason: readString(record.reason, `${path}.reason`),
    members,
  };
}

function parseInventoryAlias(
  value: unknown,
  path: string
): ModelPipelineInventory['aliases'][number] {
  const record = readRecord(value, path);
  exactKeys(record, ['name', 'tier_id', 'selectable', 'reason', 'members'], path);
  const assignment = parseAssignment(
    {
      tier_id: record.tier_id,
      alias: record.name,
      selectable: record.selectable,
      reason: record.reason,
      members: record.members,
    },
    path
  );
  return {
    name: assignment.alias,
    tier_id: assignment.tier_id,
    selectable: assignment.selectable,
    reason: assignment.reason,
    members: assignment.members,
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
    [
      'schema_version',
      'generated_at',
      'active',
      'activation_loaded_at',
      'binary_provenance',
      'routing_schema',
      'direct_models',
      'aliases',
    ],
    path
  );
  const schemaVersion = readInteger(record.schema_version, `${path}.schema_version`, 1);
  if (schemaVersion !== CLIPROXY_INVENTORY_SCHEMA_VERSION) {
    fail(`${path}.schema_version`, `must equal ${CLIPROXY_INVENTORY_SCHEMA_VERSION}`);
  }
  let active: ModelPipelineInventoryActive | null = null;
  if (record.active !== null) {
    const activePath = `${path}.active`;
    const activeRecord = readRecord(record.active, activePath);
    exactKeys(
      activeRecord,
      ['generation', 'snapshot_digest', 'projection_digest', 'config_digest'],
      activePath
    );
    active = {
      generation: readInteger(activeRecord.generation, `${activePath}.generation`, 1),
      snapshot_digest: readDigest(activeRecord.snapshot_digest, `${activePath}.snapshot_digest`),
      projection_digest: readDigest(
        activeRecord.projection_digest,
        `${activePath}.projection_digest`
      ),
      config_digest: readDigest(activeRecord.config_digest, `${activePath}.config_digest`),
    };
  }
  const activationLoadedAt =
    record.activation_loaded_at === null
      ? null
      : readUtcTimestamp(record.activation_loaded_at, `${path}.activation_loaded_at`);
  if ((active === null) !== (activationLoadedAt === null)) {
    fail(`${path}.activation_loaded_at`, 'must be null exactly when active is null');
  }
  const provenancePath = `${path}.binary_provenance`;
  const provenance = readRecord(record.binary_provenance, provenancePath);
  exactKeys(provenance, ['version', 'commit', 'built_at'], provenancePath);
  const routingSchemaPath = `${path}.routing_schema`;
  const routingSchema = readRecord(record.routing_schema, routingSchemaPath);
  exactKeys(routingSchema, ['version', 'digest'], routingSchemaPath);
  const routingSchemaVersion = readInteger(
    routingSchema.version,
    `${routingSchemaPath}.version`,
    CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION
  );
  if (routingSchemaVersion !== CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION) {
    fail(`${routingSchemaPath}.version`, `must equal ${CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION}`);
  }
  const directModels = readArray(record.direct_models, `${path}.direct_models`).map(
    (entry, index) => parseInventoryModel(entry, `${path}.direct_models[${index}]`)
  );
  assertSortedUniqueByKey(
    directModels,
    directModels.map((model) => modelKey(model.model_key)),
    `${path}.direct_models`
  );
  const routeSelectors = directModels.flatMap((model) =>
    model.routes.map((route) => route.route_selector)
  );
  if (new Set(routeSelectors).size !== routeSelectors.length) {
    fail(`${path}.direct_models`, 'must contain globally unique route_selectors');
  }
  const aliases = readArray(record.aliases, `${path}.aliases`).map((entry, index) =>
    parseInventoryAlias(entry, `${path}.aliases[${index}]`)
  );
  assertSortedUnique(
    aliases.map((alias) => alias.tier_id),
    `${path}.aliases`
  );
  if (new Set(aliases.map((alias) => alias.name)).size !== aliases.length) {
    fail(`${path}.aliases`, 'must contain unique alias names');
  }
  return {
    schema_version: CLIPROXY_INVENTORY_SCHEMA_VERSION,
    generated_at: readUtcTimestamp(record.generated_at, `${path}.generated_at`),
    active,
    activation_loaded_at: activationLoadedAt,
    binary_provenance: {
      version: readString(provenance.version, `${provenancePath}.version`),
      commit: readString(provenance.commit, `${provenancePath}.commit`),
      built_at: readUtcTimestamp(provenance.built_at, `${provenancePath}.built_at`),
    },
    routing_schema: {
      version: CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION,
      digest: readDigest(routingSchema.digest, `${routingSchemaPath}.digest`),
    },
    direct_models: directModels,
    aliases,
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

function sha256(value: unknown): string {
  return canonicalJsonSha256Digest(value);
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
  assertSortedUniqueByKey(
    catalog,
    catalog.map((model) => modelKey(model)),
    `${path}.catalog`
  );
  const observations = readArray(record.observations, `${path}.observations`).map((entry, index) =>
    parseObservation(entry, `${path}.observations[${index}]`)
  );
  assertSortedUniqueByKey(
    observations,
    observations.map((item) => `${candidateKey(item)}\u0000${item.protocol}`),
    `${path}.observations`
  );
  const routeId = (route: ModelPipelineRouteKey): string =>
    `${modelKey(route.model_key)}\u0000${route.route_channel}`;
  const inventoryRoutes = new Map(
    inventory.direct_models.flatMap((model) =>
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
    const route = inventoryRoutes.get(routeId(observation.route_key));
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
    if (!inventoryRoutes.has(routeId(evaluation.route_key))) {
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
  const candidateRoute = (candidate: ModelPipelineCandidate): ModelPipelineRouteKey =>
    candidate.route_key;
  for (const assignment of assignments) {
    for (const member of assignment.members) {
      const key = modelKey(member.model_key);
      const previousTier = tierByModel.get(key);
      if (previousTier && previousTier !== assignment.tier_id) {
        fail(`${path}.assignments`, 'assigns one ModelKey to more than one tier');
      }
      tierByModel.set(key, assignment.tier_id);
      for (const candidate of member.candidates) {
        if (!eligible.has(`${assignment.tier_id}\u0000${candidateKey(candidate)}`)) {
          fail(`${path}.assignments`, 'contains a candidate without an eligible evaluation');
        }
        const route = candidateRoute(candidate);
        const inventoryRoute = inventoryRoutes.get(routeId(route));
        if (!inventoryRoute) {
          fail(`${path}.assignments`, 'contains a candidate without an inventory route');
        }
        if (!inventoryRoute.selectable) {
          fail(
            `${path}.assignments`,
            'contains a candidate whose inventory route is not selectable'
          );
        }
        const catalogRoute = catalogRoutes.get(
          `${routeId(route)}\u0000${candidate.catalog_route_provider_id}\u0000${candidate.catalog_route_model_id}`
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
          if (
            !credential.health.selectable ||
            credential.quota.status !== 'available' ||
            credential.suspension.active ||
            credential.restrictions.some((restriction) => restriction.active)
          ) {
            fail(
              `${path}.assignments`,
              'candidate credential_refs must be usable and unrestricted'
            );
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
      }
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
  const snapshotDigest = readDigest(record.snapshot_digest, `${path}.snapshot_digest`);
  const expectedSnapshotDigest = sha256(semanticSnapshot);
  if (snapshotDigest !== expectedSnapshotDigest) {
    fail(`${path}.snapshot_digest`, `must equal ${expectedSnapshotDigest}`);
  }
  return {
    ...semanticSnapshot,
    snapshot_digest: snapshotDigest,
  };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

export function parseActiveIdentityV2(value: unknown, path = 'active_identity'): ActiveIdentityV2 {
  const record = readRecord(value, path);
  exactKeys(record, ['generation', 'snapshot_digest', 'projection_digest', 'config_digest'], path);
  return {
    generation: readInteger(record.generation, `${path}.generation`, 1),
    snapshot_digest: readDigest(record.snapshot_digest, `${path}.snapshot_digest`),
    projection_digest: readDigest(record.projection_digest, `${path}.projection_digest`),
    config_digest: readDigest(record.config_digest, `${path}.config_digest`),
  };
}

export function parseModelPipelineBinaryProvenance(
  value: unknown,
  path = 'binary_provenance'
): ModelPipelineInventory['binary_provenance'] {
  const record = readRecord(value, path);
  exactKeys(record, ['version', 'commit', 'built_at'], path);
  return {
    version: readString(record.version, `${path}.version`),
    commit: readString(record.commit, `${path}.commit`),
    built_at: readUtcTimestamp(record.built_at, `${path}.built_at`),
  };
}

export function parsePublicationReceipt(
  value: unknown,
  path = 'publication_receipt'
): PublicationReceiptV2 {
  const record = readRecord(value, path);
  exactKeys(
    record,
    [
      'schema_version',
      'ok',
      'previous_active',
      'active',
      'snapshot_schema_digest',
      'routing_schema_digest',
      'ccs_binary',
      'cliproxy_binary',
      'loaded_at',
    ],
    path
  );
  const schemaVersion = readInteger(record.schema_version, `${path}.schema_version`, 2);
  if (schemaVersion !== MODEL_PIPELINE_SCHEMA_VERSION) {
    fail(`${path}.schema_version`, `must equal ${MODEL_PIPELINE_SCHEMA_VERSION}`);
  }
  if (readBoolean(record.ok, `${path}.ok`) !== true) fail(`${path}.ok`, 'must be true');
  return {
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    ok: true,
    previous_active:
      record.previous_active === null
        ? null
        : parseActiveIdentityV2(record.previous_active, `${path}.previous_active`),
    active: parseActiveIdentityV2(record.active, `${path}.active`),
    snapshot_schema_digest: readDigest(
      record.snapshot_schema_digest,
      `${path}.snapshot_schema_digest`
    ),
    routing_schema_digest: readDigest(
      record.routing_schema_digest,
      `${path}.routing_schema_digest`
    ),
    ccs_binary: parseModelPipelineBinaryProvenance(record.ccs_binary, `${path}.ccs_binary`),
    cliproxy_binary: parseModelPipelineBinaryProvenance(
      record.cliproxy_binary,
      `${path}.cliproxy_binary`
    ),
    loaded_at: readUtcTimestamp(record.loaded_at, `${path}.loaded_at`),
  };
}

export function parseModelPipelinePublicationRequest(
  value: unknown
): ModelPipelinePublicationRequest {
  const path = 'model_pipeline_publication';
  const record = readRecord(value, path);
  exactKeys(record, ['schema_version', 'expected_active', 'snapshot'], path);
  const schemaVersion = readInteger(record.schema_version, `${path}.schema_version`, 2);
  if (schemaVersion !== MODEL_PIPELINE_SCHEMA_VERSION) {
    fail(`${path}.schema_version`, `must equal ${MODEL_PIPELINE_SCHEMA_VERSION}`);
  }
  const snapshot = parseSnapshot(record.snapshot, `${path}.snapshot`);
  const expectedActive =
    record.expected_active === null
      ? null
      : parseActiveIdentityV2(record.expected_active, `${path}.expected_active`);
  if (canonicalJson(expectedActive) !== canonicalJson(snapshot.inventory.active)) {
    fail(`${path}.expected_active`, 'must equal snapshot.inventory.active');
  }
  if (
    (expectedActive === null && snapshot.generation !== 1) ||
    (expectedActive !== null && snapshot.generation !== expectedActive.generation + 1)
  ) {
    fail(`${path}.snapshot.generation`, 'must advance expected_active by exactly one generation');
  }
  return deepFreeze({
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    expected_active: expectedActive,
    snapshot,
  });
}

export function parseModelPipelineConfig(value: unknown): ModelPipelineConfig {
  const path = 'model_pipeline';
  const record = readRecord(value, path);
  exactKeys(record, ['schema_version', 'snapshot', 'receipt'], path);
  const schemaVersion = readInteger(record.schema_version, `${path}.schema_version`, 2);
  if (schemaVersion !== MODEL_PIPELINE_SCHEMA_VERSION) {
    fail(`${path}.schema_version`, `must equal ${MODEL_PIPELINE_SCHEMA_VERSION}`);
  }
  const snapshot = parseSnapshot(record.snapshot, `${path}.snapshot`);
  if (snapshot.schema_version !== schemaVersion) {
    fail(`${path}.schema_version`, 'must match snapshot.schema_version');
  }
  const receipt = parsePublicationReceipt(record.receipt, `${path}.receipt`);
  if (
    receipt.active.generation !== snapshot.generation ||
    receipt.active.snapshot_digest !== snapshot.snapshot_digest
  ) {
    fail(`${path}.receipt.active`, 'must identify the persisted snapshot');
  }
  if (receipt.active.generation === 1) {
    if (receipt.previous_active !== null) {
      fail(`${path}.receipt.previous_active`, 'must be null for generation 1');
    }
  } else if (
    receipt.previous_active === null ||
    receipt.previous_active.generation + 1 !== receipt.active.generation
  ) {
    fail(`${path}.receipt.previous_active`, 'must identify the immediately preceding generation');
  }
  if (canonicalJson(receipt.previous_active) !== canonicalJson(snapshot.inventory.active)) {
    fail(`${path}.receipt.previous_active`, 'must equal snapshot.inventory.active');
  }
  if (receipt.routing_schema_digest !== snapshot.inventory.routing_schema.digest) {
    fail(
      `${path}.receipt.routing_schema_digest`,
      'must equal snapshot.inventory.routing_schema.digest'
    );
  }
  if (
    canonicalJson(receipt.cliproxy_binary) !== canonicalJson(snapshot.inventory.binary_provenance)
  ) {
    fail(`${path}.receipt.cliproxy_binary`, 'must equal snapshot.inventory.binary_provenance');
  }
  return deepFreeze({
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    snapshot,
    receipt,
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
