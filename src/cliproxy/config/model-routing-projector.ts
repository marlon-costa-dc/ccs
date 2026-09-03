import type {
  ModelPipelineCatalogRoute,
  ModelPipelineCredentialReference,
  ModelPipelineHealth,
  ModelPipelineModelKey,
  ModelPipelinePricing,
  ModelPipelineRestriction,
  ModelPipelineRouteKey,
  ModelPipelineSnapshot,
} from '../../config/schemas/model-pipeline';
import { ConfigError } from '../../errors/error-types';
import { canonicalJsonSha256Digest } from '../../utils/canonical-json';

export const CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION = 2 as const;

export interface CLIProxyModelKey {
  readonly 'catalog-provider-id': string;
  readonly 'canonical-model-id': string;
}

export interface CLIProxyRouteKey {
  readonly 'model-key': CLIProxyModelKey;
  readonly 'route-channel': string;
}

export interface CLIProxyCredentialReference {
  readonly id: string;
  readonly kind: string;
}

export interface CLIProxyHealth {
  readonly status: 'healthy' | 'degraded' | 'blocked' | 'unknown';
  readonly selectable: boolean;
  readonly 'observed-at': string;
  readonly 'latency-ms': number | null;
}

export interface CLIProxyRestriction {
  readonly 'rule-id': string;
  readonly 'config-path': string;
  readonly active: boolean;
  readonly reason: string;
}

export interface CLIProxyPricingEntry {
  readonly name: string;
  readonly amount: string;
  readonly 'tier-type': string | null;
  readonly 'tier-size': number | null;
  readonly 'context-key': string | null;
}

export interface CLIProxyPricing {
  readonly currency: string;
  readonly unit: string;
  readonly 'source-id': string;
  readonly entries: readonly CLIProxyPricingEntry[];
}

export interface CLIProxyRoutingCandidate {
  readonly 'route-key': CLIProxyRouteKey;
  readonly 'catalog-route-provider-id': string;
  readonly 'catalog-route-model-id': string;
  readonly 'runtime-model-id': string;
  readonly 'route-selector': string;
  readonly 'variant-id': string | null;
  readonly 'route-rank': number;
  readonly 'quota-domains': readonly string[];
  readonly 'credential-refs': readonly CLIProxyCredentialReference[];
  readonly protocols: readonly string[];
  readonly health: CLIProxyHealth;
  readonly restrictions: readonly CLIProxyRestriction[];
  readonly pricing: CLIProxyPricing | null;
  readonly 'selection-reason': string;
}

export interface CLIProxyRoutingMember {
  readonly 'model-key': CLIProxyModelKey;
  readonly 'member-rank': number;
  readonly 'model-score': string;
  readonly 'selection-reason': string;
  readonly candidates: readonly CLIProxyRoutingCandidate[];
}

export interface CLIProxyRoutingAlias {
  readonly name: string;
  readonly 'tier-id': string;
  readonly selectable: boolean;
  readonly reason: string;
  readonly members: readonly CLIProxyRoutingMember[];
}

export interface CLIProxyDirectVariant {
  readonly 'variant-key': {
    readonly 'model-key': CLIProxyModelKey;
    readonly 'variant-id': string;
  };
  readonly 'display-name': string | null;
  readonly 'reasoning-option': string | null;
  readonly protocols: readonly string[];
}

export interface CLIProxyDirectRoute {
  readonly 'route-key': CLIProxyRouteKey;
  readonly 'catalog-route-provider-id': string;
  readonly 'catalog-route-model-id': string;
  readonly 'runtime-model-id': string;
  readonly 'route-selector': string;
  readonly 'quota-domains': readonly string[];
  readonly 'credential-refs': readonly CLIProxyCredentialReference[];
  readonly protocols: readonly string[];
  readonly restrictions: readonly CLIProxyRestriction[];
  readonly health: CLIProxyHealth;
  readonly pricing: CLIProxyPricing | null;
  readonly selectable: boolean;
  readonly 'selection-reason': string;
}

export interface CLIProxyDirectModel {
  readonly 'model-key': CLIProxyModelKey;
  readonly 'display-name': string;
  readonly active: boolean;
  readonly variants: readonly CLIProxyDirectVariant[];
  readonly routes: readonly CLIProxyDirectRoute[];
}

export interface CLIProxyModelRouting {
  readonly 'schema-version': typeof CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION;
  readonly generation: number;
  readonly 'snapshot-digest': string;
  readonly 'projection-digest': string;
  readonly aliases: readonly CLIProxyRoutingAlias[];
  readonly 'direct-models': readonly CLIProxyDirectModel[];
  readonly 'failure-policy': {
    readonly mode: 'classified_candidate_failover';
    readonly 'credential-acquisition-timeout-seconds': number;
    readonly 'automatic-retry': false;
    readonly 'automatic-failover': true;
    readonly 'failover-rules': readonly {
      readonly 'rule-id': string;
      readonly 'http-statuses': readonly number[];
      readonly 'error-codes': readonly string[];
      readonly 'failure-kinds': readonly string[];
    }[];
    readonly 'serve-stale-on-error': false;
    readonly 'preserve-first-error': true;
    readonly 'terminate-owned-request-on-cancel': true;
  };
}

function projectModelKey(value: ModelPipelineModelKey): CLIProxyModelKey {
  return {
    'catalog-provider-id': value.catalog_provider_id,
    'canonical-model-id': value.canonical_model_id,
  };
}

function projectRouteKey(value: ModelPipelineRouteKey): CLIProxyRouteKey {
  return {
    'model-key': projectModelKey(value.model_key),
    'route-channel': value.route_channel,
  };
}

function projectCredentialReference(
  value: ModelPipelineCredentialReference
): CLIProxyCredentialReference {
  return { id: value.id, kind: value.kind };
}

function projectHealth(value: ModelPipelineHealth): CLIProxyHealth {
  return {
    status: value.status,
    selectable: value.selectable,
    'observed-at': value.observed_at,
    'latency-ms': value.latency_ms,
  };
}

function projectRestriction(value: ModelPipelineRestriction): CLIProxyRestriction {
  return {
    'rule-id': value.rule_id,
    'config-path': value.config_path,
    active: value.active,
    reason: value.reason,
  };
}

function projectPricing(value: ModelPipelinePricing | null): CLIProxyPricing | null {
  if (value === null) return null;
  return {
    currency: value.currency,
    unit: value.unit,
    'source-id': value.source_id,
    entries: value.entries.map((entry) => ({
      name: entry.name,
      amount: entry.amount,
      'tier-type': entry.tier_type,
      'tier-size': entry.tier_size,
      'context-key': entry.context_key,
    })),
  };
}

function projectCandidate(
  candidate: ModelPipelineSnapshot['assignments'][number]['members'][number]['candidates'][number]
): CLIProxyRoutingCandidate {
  return {
    'route-key': {
      'model-key': projectModelKey(candidate.route_key.model_key),
      'route-channel': candidate.route_key.route_channel,
    },
    'catalog-route-provider-id': candidate.catalog_route_provider_id,
    'catalog-route-model-id': candidate.catalog_route_model_id,
    'runtime-model-id': candidate.runtime_model_id,
    'route-selector': candidate.route_selector,
    'variant-id': candidate.variant_id,
    'route-rank': candidate.route_rank,
    'quota-domains': candidate.quota_domains,
    'credential-refs': candidate.credential_refs.map(projectCredentialReference),
    protocols: candidate.protocols,
    health: projectHealth(candidate.health),
    restrictions: candidate.restrictions.map(projectRestriction),
    pricing: projectPricing(candidate.pricing),
    'selection-reason': candidate.selection_reason,
  };
}

function routeIdentity(
  routeKey: ModelPipelineRouteKey,
  catalogRouteProviderId: string,
  catalogRouteModelId: string
): string {
  return [
    routeKey.model_key.catalog_provider_id,
    routeKey.model_key.canonical_model_id,
    routeKey.route_channel,
    catalogRouteProviderId,
    catalogRouteModelId,
  ].join('\u0000');
}

function modelIdentity(value: ModelPipelineModelKey): string {
  return `${value.catalog_provider_id}\u0000${value.canonical_model_id}`;
}

function catalogRoutesByIdentity(
  snapshot: ModelPipelineSnapshot
): ReadonlyMap<string, ModelPipelineCatalogRoute> {
  return new Map(
    snapshot.catalog.flatMap((model) =>
      model.routes.map(
        (route) =>
          [
            routeIdentity(
              route.route_key,
              route.catalog_route_provider_id,
              route.catalog_route_model_id
            ),
            route,
          ] as const
      )
    )
  );
}

function projectDirectModels(snapshot: ModelPipelineSnapshot): readonly CLIProxyDirectModel[] {
  const catalogRoutes = catalogRoutesByIdentity(snapshot);
  const catalogModels = new Map(snapshot.catalog.map((model) => [modelIdentity(model), model]));
  const projected: CLIProxyDirectModel[] = [];

  for (const model of snapshot.inventory.direct_models) {
    if (!model.active) continue;
    const routes: CLIProxyDirectRoute[] = [];
    for (const route of model.routes) {
      if (!route.selectable) continue;
      const credentials = route.credentials.filter(
        (credential) =>
          credential.health.selectable &&
          credential.quota.status === 'available' &&
          !credential.suspension.active &&
          credential.restrictions.every((restriction) => !restriction.active)
      );
      if (credentials.length === 0) {
        throw new ConfigError(
          `model_pipeline selectable route ${route.route_selector} has no usable credential`
        );
      }
      const catalogRoute = catalogRoutes.get(
        routeIdentity(
          route.route_key,
          route.catalog_route_provider_id,
          route.catalog_route_model_id
        )
      );
      if (!catalogRoute) {
        throw new ConfigError(
          `model_pipeline selectable route ${route.route_key.model_key.catalog_provider_id}/${route.route_key.model_key.canonical_model_id}/${route.route_key.route_channel} has no matching catalog route`
        );
      }
      routes.push({
        'route-key': projectRouteKey(route.route_key),
        'catalog-route-provider-id': route.catalog_route_provider_id,
        'catalog-route-model-id': route.catalog_route_model_id,
        'runtime-model-id': route.runtime_model_id,
        'route-selector': route.route_selector,
        'quota-domains': [
          ...new Set(credentials.map((credential) => credential.quota_domain)),
        ].sort(),
        'credential-refs': credentials.map((credential) =>
          projectCredentialReference(credential.credential_ref)
        ),
        protocols: route.protocols,
        restrictions: route.restrictions.map(projectRestriction),
        health: projectHealth(route.health),
        pricing: projectPricing(catalogRoute.pricing),
        selectable: route.selectable,
        'selection-reason': route.selection_reason,
      });
    }
    if (routes.length === 0) continue;
    const catalogModel = catalogModels.get(modelIdentity(model.model_key));
    if (!catalogModel) {
      throw new ConfigError(
        `model_pipeline direct model ${model.model_key.catalog_provider_id}/${model.model_key.canonical_model_id} has no matching catalog model`
      );
    }
    const catalogVariants = new Map(
      catalogModel.variants.map((variant) => [variant.variant_id, variant])
    );
    projected.push({
      'model-key': projectModelKey(model.model_key),
      'display-name': model.display_name,
      active: model.active,
      variants: model.variants.map((variant) => {
        const catalogVariant = catalogVariants.get(variant.variant_key.variant_id);
        if (!catalogVariant) {
          throw new ConfigError(
            `model_pipeline inventory variant ${model.model_key.catalog_provider_id}/${model.model_key.canonical_model_id}/${variant.variant_key.variant_id} has no matching catalog variant`
          );
        }
        return {
          'variant-key': {
            'model-key': projectModelKey(variant.variant_key.model_key),
            'variant-id': variant.variant_key.variant_id,
          },
          'display-name': variant.display_name,
          'reasoning-option': catalogVariant.reasoning_option,
          protocols: variant.protocols,
        };
      }),
      routes,
    });
  }

  return projected;
}

type CLIProxyModelRoutingPayload = Omit<CLIProxyModelRouting, 'projection-digest'>;

export function computeProjectionDigest(payload: CLIProxyModelRoutingPayload): string {
  return canonicalJsonSha256Digest(payload);
}

export function projectModelRoutingPayload(
  snapshot: ModelPipelineSnapshot
): CLIProxyModelRoutingPayload {
  return {
    'schema-version': CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION,
    generation: snapshot.generation,
    'snapshot-digest': snapshot.snapshot_digest,
    aliases: snapshot.assignments.map((assignment) => ({
      name: assignment.alias,
      'tier-id': assignment.tier_id,
      selectable: assignment.selectable,
      reason: assignment.reason,
      members: assignment.members.map((member) => ({
        'model-key': projectModelKey(member.model_key),
        'member-rank': member.member_rank,
        'model-score': member.model_score,
        'selection-reason': member.selection_reason,
        candidates: member.candidates.map(projectCandidate),
      })),
    })),
    'direct-models': projectDirectModels(snapshot),
    'failure-policy': {
      mode: snapshot.failure_policy.mode,
      'credential-acquisition-timeout-seconds':
        snapshot.failure_policy.credential_acquisition_timeout_seconds,
      'automatic-retry': snapshot.failure_policy.automatic_retry,
      'automatic-failover': snapshot.failure_policy.automatic_failover,
      'failover-rules': snapshot.failure_policy.failover_rules.map((rule) => ({
        'rule-id': rule.rule_id,
        'http-statuses': rule.http_statuses,
        'error-codes': rule.error_codes,
        'failure-kinds': rule.failure_kinds,
      })),
      'serve-stale-on-error': snapshot.failure_policy.serve_stale_on_error,
      'preserve-first-error': snapshot.failure_policy.preserve_first_error,
      'terminate-owned-request-on-cancel':
        snapshot.failure_policy.terminate_owned_request_on_cancel,
    },
  };
}

export function projectModelRouting(snapshot: ModelPipelineSnapshot): CLIProxyModelRouting {
  const payload = projectModelRoutingPayload(snapshot);
  return { ...payload, 'projection-digest': computeProjectionDigest(payload) };
}
