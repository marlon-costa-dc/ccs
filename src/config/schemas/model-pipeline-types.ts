export const MODEL_PIPELINE_SCHEMA_VERSION = 2 as const;

export interface ModelPipelineModelKey {
  readonly catalog_provider_id: string;
  readonly canonical_model_id: string;
}

export interface ModelPipelineRouteKey {
  readonly model_key: ModelPipelineModelKey;
  readonly route_channel: string;
}

export interface ModelPipelineVariantKey {
  readonly model_key: ModelPipelineModelKey;
  readonly variant_id: string;
}

export interface ModelPipelineSourceDigest {
  readonly source_id: string;
  readonly digest: string;
}

export interface ModelPipelineRestriction {
  readonly rule_id: string;
  readonly config_path: string;
  readonly active: boolean;
  readonly reason: string;
}

export interface ModelPipelineHealth {
  readonly status: 'healthy' | 'degraded' | 'blocked' | 'unknown';
  readonly selectable: boolean;
  readonly observed_at: string;
  readonly latency_ms: number | null;
}

export interface ModelPipelinePriceEntry {
  readonly name: string;
  readonly amount: string;
  readonly tier_type: string | null;
  readonly tier_size: number | null;
  readonly context_key: string | null;
}

export interface ModelPipelinePricing {
  readonly currency: string;
  readonly unit: string;
  readonly source_id: string;
  readonly entries: readonly ModelPipelinePriceEntry[];
}

export interface ModelPipelineQuotaState {
  readonly status: 'available' | 'blocked' | 'unknown';
  readonly remaining: string | null;
  readonly resets_at: string | null;
  readonly reason: string | null;
}

export interface ModelPipelineSuspensionState {
  readonly active: boolean;
  readonly reason: string | null;
  readonly resumes_at: string | null;
}

export interface ModelPipelineCredentialReference {
  readonly id: string;
  readonly kind: string;
}

export interface ModelPipelineInventoryCredential {
  readonly credential_ref: ModelPipelineCredentialReference;
  readonly quota_domain: string;
  readonly health: ModelPipelineHealth;
  readonly quota: ModelPipelineQuotaState;
  readonly suspension: ModelPipelineSuspensionState;
  readonly restrictions: readonly ModelPipelineRestriction[];
}

export interface ModelPipelineInventoryRoute {
  readonly route_key: ModelPipelineRouteKey;
  readonly catalog_route_provider_id: string;
  readonly catalog_route_model_id: string;
  readonly runtime_model_id: string;
  readonly route_selector: string;
  readonly quota_domains: readonly string[];
  readonly protocols: readonly string[];
  readonly restrictions: readonly ModelPipelineRestriction[];
  readonly health: ModelPipelineHealth;
  readonly selectable: boolean;
  readonly selection_reason: string;
  readonly credentials: readonly ModelPipelineInventoryCredential[];
}

export interface ModelPipelineInventoryVariant {
  readonly variant_key: ModelPipelineVariantKey;
  readonly display_name: string | null;
  readonly protocols: readonly string[];
}

export interface ModelPipelineInventoryModel {
  readonly model_key: ModelPipelineModelKey;
  readonly display_name: string;
  readonly active: boolean;
  readonly variants: readonly ModelPipelineInventoryVariant[];
  readonly routes: readonly ModelPipelineInventoryRoute[];
}

export interface ModelPipelineInventoryActive {
  readonly generation: number;
  readonly snapshot_digest: string;
  readonly projection_digest: string;
  readonly config_digest: string;
}

export interface ModelPipelineBinaryProvenance {
  readonly version: string;
  readonly commit: string;
  readonly built_at: string;
}

export interface ModelPipelineInventory {
  readonly schema_version: typeof MODEL_PIPELINE_SCHEMA_VERSION;
  readonly generated_at: string;
  readonly active: ModelPipelineInventoryActive | null;
  readonly activation_loaded_at: string | null;
  readonly binary_provenance: ModelPipelineBinaryProvenance;
  readonly routing_schema: {
    readonly version: typeof MODEL_PIPELINE_SCHEMA_VERSION;
    readonly digest: string;
  };
  readonly direct_models: readonly ModelPipelineInventoryModel[];
  readonly aliases: readonly ModelPipelineInventoryAlias[];
}

export interface ModelPipelineCatalogBenchmark {
  readonly name: string;
  readonly score: string;
  readonly metric: string | null;
  readonly source: string | null;
  readonly dataset: string | null;
  readonly date: string | null;
  readonly harness: string | null;
  readonly variant: string | null;
  readonly version: string | null;
}

export interface ModelPipelineLimits {
  readonly context: number;
  readonly input: number | null;
  readonly output: number;
}

export interface ModelPipelineModalities {
  readonly input: readonly string[];
  readonly output: readonly string[];
}

export interface ModelPipelineCapabilities {
  readonly attachment: boolean | null;
  readonly reasoning: boolean | null;
  readonly structured_output: boolean | null;
  readonly temperature: boolean | null;
  readonly tool_call: boolean | null;
  readonly open_weights: boolean | null;
}

export interface ModelPipelineReasoningOption {
  readonly type: string;
  readonly values: readonly (string | null)[];
  readonly min: number | null;
  readonly max: number | null;
}

export interface ModelPipelineCatalogVariant {
  readonly variant_key: ModelPipelineVariantKey;
  readonly display_name: string | null;
  readonly reasoning_option: string | null;
  readonly own_capabilities: readonly string[];
  readonly inherited_capabilities: readonly string[];
  readonly source_id: string;
}

export interface ModelPipelineCatalogModel {
  readonly model_key: ModelPipelineModelKey;
  readonly display_name: string;
  readonly family: string | null;
  readonly source_id: string;
  readonly status: string | null;
  readonly release_date: string | null;
  readonly last_updated: string | null;
  readonly knowledge_cutoff: string | null;
  readonly limits: ModelPipelineLimits;
  readonly modalities: ModelPipelineModalities;
  readonly capabilities: ModelPipelineCapabilities;
  readonly reasoning_options: readonly ModelPipelineReasoningOption[];
  readonly benchmarks: readonly ModelPipelineCatalogBenchmark[];
  readonly variants: readonly ModelPipelineCatalogVariant[];
  readonly routes: readonly ModelPipelineCatalogRoute[];
}

export interface ModelPipelineCatalogRoute {
  readonly route_key: ModelPipelineRouteKey;
  readonly catalog_route_provider_id: string;
  readonly catalog_route_model_id: string;
  readonly source_id: string;
  readonly display_name: string;
  readonly status: string | null;
  readonly release_date: string | null;
  readonly last_updated: string | null;
  readonly knowledge_cutoff: string | null;
  readonly limits: ModelPipelineLimits;
  readonly modalities: ModelPipelineModalities;
  readonly capabilities: ModelPipelineCapabilities;
  readonly reasoning_options: readonly ModelPipelineReasoningOption[];
  readonly pricing: ModelPipelinePricing | null;
}

export interface ModelPipelineObservation {
  readonly route_key: ModelPipelineRouteKey;
  readonly variant_id: string | null;
  readonly protocol: string;
  readonly observed_at: string;
  readonly outcome: string;
  readonly http_status: number | null;
  readonly latency_ms: number | null;
  readonly effective_model_id: string | null;
  readonly effective_variant_id: string | null;
  readonly credential_ref: ModelPipelineCredentialReference | null;
  readonly quota_domain: string | null;
  readonly rejection_reason: string | null;
}

export interface ModelPipelineRuleEvaluation {
  readonly rule_id: string;
  readonly config_path: string;
  readonly passed: boolean;
  readonly reason: string;
}

export interface ModelPipelineEvaluationMetric {
  readonly name: string;
  readonly value: string;
  readonly source: string;
}

export interface ModelPipelineCandidateEvaluation {
  readonly route_key: ModelPipelineRouteKey;
  readonly variant_id: string | null;
  readonly tier_id: string;
  readonly eligible: boolean;
  readonly score: string | null;
  readonly metrics: readonly ModelPipelineEvaluationMetric[];
  readonly rules: readonly ModelPipelineRuleEvaluation[];
}

export interface ModelPipelineCandidateRejection {
  readonly route_key: ModelPipelineRouteKey;
  readonly variant_id: string | null;
  readonly tier_id: string;
  readonly rule_id: string;
  readonly config_path: string;
  readonly reason: string;
}

export interface ModelPipelineCandidate {
  readonly route_key: ModelPipelineRouteKey;
  readonly variant_id: string | null;
  readonly catalog_route_provider_id: string;
  readonly catalog_route_model_id: string;
  readonly runtime_model_id: string;
  readonly route_selector: string;
  readonly route_rank: number;
  readonly quota_domains: readonly string[];
  readonly credential_refs: readonly ModelPipelineCredentialReference[];
  readonly protocols: readonly string[];
  readonly health: ModelPipelineHealth;
  readonly restrictions: readonly ModelPipelineRestriction[];
  readonly pricing: ModelPipelinePricing | null;
  readonly selection_reason: string;
}

export interface ModelPipelineMember {
  readonly model_key: ModelPipelineModelKey;
  readonly member_rank: number;
  readonly model_score: string;
  readonly selection_reason: string;
  readonly candidates: readonly ModelPipelineCandidate[];
}

export interface ModelPipelineAssignment {
  readonly tier_id: string;
  readonly alias: string;
  readonly selectable: boolean;
  readonly reason: string;
  readonly members: readonly ModelPipelineMember[];
}

export interface ModelPipelineInventoryAlias {
  readonly name: string;
  readonly tier_id: string;
  readonly selectable: boolean;
  readonly reason: string;
  readonly members: readonly ModelPipelineMember[];
}

export interface ModelPipelineAgentBinding {
  readonly agent: string;
  readonly tier_id: string;
  readonly alias: string;
}

export type ModelPipelineFailureKind =
  | 'credential'
  | 'transport'
  | 'upstream_timeout'
  | 'empty_pre_response';

export interface ModelPipelineFailoverRule {
  readonly rule_id: string;
  readonly http_statuses: readonly number[];
  readonly error_codes: readonly string[];
  readonly failure_kinds: readonly ModelPipelineFailureKind[];
}

export interface ModelPipelineFailurePolicy {
  readonly mode: 'classified_candidate_failover';
  readonly credential_acquisition_timeout_seconds: number;
  readonly automatic_retry: false;
  readonly automatic_failover: true;
  readonly max_candidate_attempts: number;
  readonly failover_rules: readonly ModelPipelineFailoverRule[];
  readonly serve_stale_on_error: false;
  readonly preserve_first_error: true;
  readonly terminate_owned_request_on_cancel: true;
}

export interface ModelPipelinePublicationTarget {
  readonly target_id: string;
  readonly format: string;
  readonly location: string;
  readonly required: boolean;
}

export interface ModelPipelinePublication {
  readonly mode: string;
  readonly request_timeout_seconds: number;
  readonly retained_snapshots: number;
  readonly targets: readonly ModelPipelinePublicationTarget[];
}

export interface ModelPipelineSnapshot {
  readonly schema_version: typeof MODEL_PIPELINE_SCHEMA_VERSION;
  readonly generation: number;
  readonly generated_at: string;
  readonly source_digests: readonly ModelPipelineSourceDigest[];
  readonly inventory: ModelPipelineInventory;
  readonly catalog: readonly ModelPipelineCatalogModel[];
  readonly observations: readonly ModelPipelineObservation[];
  readonly evaluations: readonly ModelPipelineCandidateEvaluation[];
  readonly rejections: readonly ModelPipelineCandidateRejection[];
  readonly assignments: readonly ModelPipelineAssignment[];
  readonly agent_bindings: readonly ModelPipelineAgentBinding[];
  readonly failure_policy: ModelPipelineFailurePolicy;
  readonly publication: ModelPipelinePublication;
  readonly snapshot_digest: string;
}

export interface ActiveIdentityV2 {
  readonly generation: number;
  readonly snapshot_digest: string;
  readonly projection_digest: string;
  readonly config_digest: string;
}

export interface PublicationReceiptV2 {
  readonly schema_version: typeof MODEL_PIPELINE_SCHEMA_VERSION;
  readonly ok: true;
  readonly previous_active: ActiveIdentityV2 | null;
  readonly active: ActiveIdentityV2;
  readonly snapshot_schema_digest: string;
  readonly routing_schema_digest: string;
  readonly ccs_binary: ModelPipelineBinaryProvenance;
  readonly cliproxy_binary: ModelPipelineBinaryProvenance;
  readonly loaded_at: string;
}

export interface ModelPipelinePublicationRequest {
  readonly schema_version: typeof MODEL_PIPELINE_SCHEMA_VERSION;
  readonly expected_active: ActiveIdentityV2 | null;
  readonly snapshot: ModelPipelineSnapshot;
}

export interface ModelPipelineConfig {
  readonly schema_version: typeof MODEL_PIPELINE_SCHEMA_VERSION;
  readonly snapshot: ModelPipelineSnapshot;
  readonly receipt: PublicationReceiptV2;
}
