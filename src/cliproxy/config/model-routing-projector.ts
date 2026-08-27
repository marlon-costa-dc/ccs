import * as yaml from 'js-yaml';
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

export const CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION = 1 as const;

export interface CLIProxyModelKey {
  readonly 'catalog-provider-id': string;
  readonly 'canonical-model-id': string;
}

export interface CLIProxyRouteKey extends CLIProxyModelKey {
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
  readonly 'model-key': CLIProxyModelKey;
  readonly 'route-channel': string;
  readonly 'catalog-route-provider-id': string;
  readonly 'catalog-route-model-id': string;
  readonly 'runtime-model-id': string;
  readonly 'route-selector': string;
  readonly 'variant-id': string | null;
  readonly rank: number;
  readonly 'quota-domains': readonly string[];
  readonly 'credential-refs': readonly CLIProxyCredentialReference[];
  readonly protocols: readonly string[];
  readonly health: CLIProxyHealth;
  readonly restrictions: readonly CLIProxyRestriction[];
  readonly pricing: CLIProxyPricing | null;
  readonly 'selection-reason': string;
}

export interface CLIProxyRoutingAlias {
  readonly name: string;
  readonly 'tier-id': string;
  readonly selectable: boolean;
  readonly reason: string;
  readonly candidates: readonly CLIProxyRoutingCandidate[];
}

export interface CLIProxyDirectVariant {
  readonly 'variant-key': CLIProxyModelKey & { readonly 'variant-id': string };
  readonly 'display-name': string | null;
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

export interface CLIProxyRetryRule {
  readonly 'rule-id': string;
  readonly 'config-path': string;
  readonly 'http-statuses': readonly number[];
  readonly 'classifier-codes': readonly string[];
  readonly 'retry-before-first-byte': boolean;
  readonly 'retry-after-first-byte': false;
}

export interface CLIProxyModelRouting {
  readonly 'schema-version': typeof CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION;
  readonly generation: number;
  readonly 'snapshot-digest': string;
  readonly 'projection-digest': string;
  readonly aliases: readonly CLIProxyRoutingAlias[];
  readonly 'direct-models': readonly CLIProxyDirectModel[];
  readonly 'retry-policy': {
    readonly 'max-attempts': number;
    readonly 'cooldown-seconds': number;
    readonly 'request-timeout-seconds': number;
    readonly 'restore-primary-after-cooldown': boolean;
    readonly 'fail-when-all-candidates-blocked': boolean;
    readonly rules: readonly CLIProxyRetryRule[];
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
    ...projectModelKey(value),
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
  candidate: ModelPipelineSnapshot['assignments'][number]['candidates'][number]
): CLIProxyRoutingCandidate {
  return {
    'model-key': projectModelKey(candidate),
    'route-channel': candidate.route_channel,
    'catalog-route-provider-id': candidate.catalog_route_provider_id,
    'catalog-route-model-id': candidate.catalog_route_model_id,
    'runtime-model-id': candidate.runtime_model_id,
    'route-selector': candidate.route_selector,
    'variant-id': candidate.variant_id,
    rank: candidate.rank,
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
    routeKey.catalog_provider_id,
    routeKey.canonical_model_id,
    routeKey.route_channel,
    catalogRouteProviderId,
    catalogRouteModelId,
  ].join('\u0000');
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
  const projected: CLIProxyDirectModel[] = [];

  for (const model of snapshot.inventory.models) {
    const routes: CLIProxyDirectRoute[] = [];
    for (const route of model.routes) {
      if (!route.selectable) continue;
      const catalogRoute = catalogRoutes.get(
        routeIdentity(
          route.route_key,
          route.catalog_route_provider_id,
          route.catalog_route_model_id
        )
      );
      if (!catalogRoute) {
        throw new ConfigError(
          `model_pipeline selectable route ${route.route_key.catalog_provider_id}/${route.route_key.canonical_model_id}/${route.route_key.route_channel} has no matching catalog route`
        );
      }
      routes.push({
        'route-key': projectRouteKey(route.route_key),
        'catalog-route-provider-id': route.catalog_route_provider_id,
        'catalog-route-model-id': route.catalog_route_model_id,
        'runtime-model-id': route.runtime_model_id,
        'route-selector': route.route_selector,
        'quota-domains': route.quota_domains,
        'credential-refs': route.credentials.map((credential) =>
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
    projected.push({
      'model-key': projectModelKey(model.model_key),
      'display-name': model.display_name,
      active: model.active,
      variants: model.variants.map((variant) => ({
        'variant-key': {
          ...projectModelKey(variant.variant_key),
          'variant-id': variant.variant_key.variant_id,
        },
        'display-name': variant.display_name,
        protocols: variant.protocols,
      })),
      routes,
    });
  }

  return projected;
}

export function projectModelRouting(snapshot: ModelPipelineSnapshot): CLIProxyModelRouting {
  return {
    'schema-version': CLIPROXY_MODEL_ROUTING_SCHEMA_VERSION,
    generation: snapshot.generation,
    'snapshot-digest': snapshot.snapshot_digest,
    'projection-digest': snapshot.projection_digest,
    aliases: snapshot.assignments.map((assignment) => ({
      name: assignment.alias,
      'tier-id': assignment.tier_id,
      selectable: assignment.selectable,
      reason: assignment.reason,
      candidates: assignment.candidates.map(projectCandidate),
    })),
    'direct-models': projectDirectModels(snapshot),
    'retry-policy': {
      'max-attempts': snapshot.retry_policy.max_attempts,
      'cooldown-seconds': snapshot.retry_policy.cooldown_seconds,
      'request-timeout-seconds': snapshot.retry_policy.request_timeout_seconds,
      'restore-primary-after-cooldown': snapshot.retry_policy.restore_primary_after_cooldown,
      'fail-when-all-candidates-blocked': snapshot.retry_policy.fail_when_all_candidates_blocked,
      rules: snapshot.retry_policy.rules.map((rule) => ({
        'rule-id': rule.rule_id,
        'config-path': rule.config_path,
        'http-statuses': rule.http_statuses,
        'classifier-codes': rule.classifier_codes,
        'retry-before-first-byte': rule.retry_before_first_byte,
        'retry-after-first-byte': rule.retry_after_first_byte,
      })),
    },
  };
}

export function serializeModelRoutingSection(snapshot: ModelPipelineSnapshot): string {
  return yaml.dump(
    { 'model-routing': projectModelRouting(snapshot) },
    { noRefs: true, lineWidth: -1, noCompatMode: true }
  );
}
