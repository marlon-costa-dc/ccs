import type { UnifiedConfig } from '../../config/unified-config-types';
import { loadUnifiedConfig, mutateConfig } from '../../config/config-loader-facade';
import {
  MODEL_PIPELINE_SCHEMA_VERSION,
  parseModelPipelinePublicationRequest,
  type ActiveIdentityV2,
  type ModelPipelineConfig,
  type ModelPipelineInventory,
  type ModelPipelinePublicationRequest,
  type ModelPipelineSnapshot,
  type PublicationReceiptV2,
} from '../../config/schemas/model-pipeline';
import { getModelPipelineSnapshotSchemaDigest } from '../../config/schemas/model-pipeline-contract-artifacts';
import { ConfigError, UserAbortError } from '../../errors/error-types';
import { canonicalJson, sha256Digest } from '../../utils/canonical-json';
import { getBuildProvenance } from '../../utils/version';
import { renderUnifiedConfigForPublication } from '../config/generator';
import { projectModelRouting } from '../config/model-routing-projector';
import { ManagementApiClient } from '../management/management-api-client';
import type { CLIProxyActivationReceipt } from '../management/management-api-types';
import { resolveProxyTarget, type ProxyTarget } from '../proxy/proxy-target-resolver';
import {
  withModelPipelineTransactionLock,
  type ModelPipelinePublicationIntent,
  type ModelPipelineTransactionStore,
} from './model-pipeline-transaction-store';

export interface ModelPipelinePublicationClient {
  getConfigYaml(signal?: AbortSignal): Promise<string>;
  putConfigYaml(
    configYaml: string,
    expectedActive: ActiveIdentityV2 | null,
    signal?: AbortSignal
  ): Promise<CLIProxyActivationReceipt>;
  getModelInventory(signal?: AbortSignal): Promise<ModelPipelineInventory>;
}

export interface ModelPipelinePublisherDependencies {
  loadConfig(): UnifiedConfig;
  persistPipeline(
    pipeline: ModelPipelineConfig,
    expectedActive: ActiveIdentityV2 | null
  ): UnifiedConfig;
  renderConfig(activeConfigYaml: string, snapshot: ModelPipelineSnapshot): string;
  resolveTarget(config: UnifiedConfig): ProxyTarget;
  createClient(
    target: ProxyTarget,
    config: UnifiedConfig,
    managementTimeoutMs: number
  ): ModelPipelinePublicationClient;
  snapshotSchemaDigest(): string;
  ccsBinary(): ModelPipelineInventory['binary_provenance'];
  withTransaction<T>(operation: (store: ModelPipelineTransactionStore) => Promise<T>): Promise<T>;
}

export type VerifiedModelPipelinePublication = PublicationReceiptV2;

export class ModelPipelineGenerationConflictError extends ConfigError {
  constructor(message: string, cause?: unknown) {
    super(message, undefined, cause);
    this.name = 'ModelPipelineGenerationConflictError';
  }
}

export class ModelPipelineSnapshotNotFoundError extends ConfigError {
  constructor() {
    super('Model pipeline snapshot not found');
    this.name = 'ModelPipelineSnapshotNotFoundError';
  }
}

function identitiesEqual(
  left: ActiveIdentityV2 | null | undefined,
  right: ActiveIdentityV2 | null | undefined
): boolean {
  return canonicalJson(left ?? null) === canonicalJson(right ?? null);
}

function provenanceEqual(
  left: ModelPipelineInventory['binary_provenance'],
  right: ModelPipelineInventory['binary_provenance']
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function pipelineEqual(left: ModelPipelineConfig, right: ModelPipelineConfig): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function replaceModelPipeline(
  config: UnifiedConfig,
  incoming: ModelPipelineConfig,
  expectedActive: ActiveIdentityV2 | null
): void {
  const current = config.model_pipeline;
  if (current && identitiesEqual(current.receipt.active, incoming.receipt.active)) {
    if (!pipelineEqual(current, incoming)) {
      throw new ModelPipelineGenerationConflictError(
        'persisted model_pipeline has the proposed identity with different snapshot or receipt bytes'
      );
    }
    return;
  }
  if (expectedActive === null) {
    if (current) {
      throw new ModelPipelineGenerationConflictError(
        'model_pipeline bootstrap requires no persisted active identity'
      );
    }
  } else if (!current || !identitiesEqual(current.receipt.active, expectedActive)) {
    throw new ModelPipelineGenerationConflictError(
      'persisted model_pipeline identity does not match expected_active'
    );
  }
  config.model_pipeline = incoming;
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new UserAbortError('Model pipeline publication cancelled');
}

function assertIdentity(
  actual: ActiveIdentityV2 | null,
  expected: ActiveIdentityV2 | null,
  label: string
): void {
  if (!identitiesEqual(actual, expected)) {
    throw new ModelPipelineGenerationConflictError(`${label} does not match expected identity`);
  }
}

function assertInventoryEvidence(
  snapshotInventory: ModelPipelineInventory,
  liveInventory: ModelPipelineInventory
): void {
  if (!identitiesEqual(snapshotInventory.active, liveInventory.active)) {
    throw new ModelPipelineGenerationConflictError(
      'snapshot inventory active identity is stale relative to CLIProxy'
    );
  }
  if (snapshotInventory.activation_loaded_at !== liveInventory.activation_loaded_at) {
    throw new ModelPipelineGenerationConflictError(
      'snapshot inventory activation_loaded_at is stale relative to CLIProxy'
    );
  }
  if (!provenanceEqual(snapshotInventory.binary_provenance, liveInventory.binary_provenance)) {
    throw new ModelPipelineGenerationConflictError(
      'snapshot inventory CLIProxy binary provenance is stale'
    );
  }
  if (
    canonicalJson(snapshotInventory.routing_schema) !== canonicalJson(liveInventory.routing_schema)
  ) {
    throw new ModelPipelineGenerationConflictError('snapshot inventory routing schema is stale');
  }
  if (
    canonicalJson(snapshotInventory.direct_models) !== canonicalJson(liveInventory.direct_models) ||
    canonicalJson(snapshotInventory.aliases) !== canonicalJson(liveInventory.aliases)
  ) {
    throw new ModelPipelineGenerationConflictError(
      'snapshot inventory model or alias facts are stale relative to CLIProxy'
    );
  }
}

function assertTransition(
  request: ModelPipelinePublicationRequest,
  persisted: ModelPipelineConfig | undefined,
  liveInventory: ModelPipelineInventory
): void {
  const expected = request.expected_active;
  assertIdentity(liveInventory.active, expected, 'CLIProxy active identity');
  assertInventoryEvidence(request.snapshot.inventory, liveInventory);
  if (expected === null) {
    if (persisted) {
      throw new ModelPipelineGenerationConflictError(
        'model pipeline bootstrap is forbidden while CCS has persisted state'
      );
    }
    if (request.snapshot.generation !== 1) {
      throw new ModelPipelineGenerationConflictError(
        'model pipeline bootstrap snapshot generation must equal 1'
      );
    }
    return;
  }
  if (!persisted || !identitiesEqual(persisted.receipt.active, expected)) {
    throw new ModelPipelineGenerationConflictError(
      'expected_active does not match the CCS persisted identity'
    );
  }
  if (request.snapshot.generation !== expected.generation + 1) {
    throw new ModelPipelineGenerationConflictError(
      `next snapshot generation must equal ${expected.generation + 1}`
    );
  }
}

function createDefaultClient(
  target: ProxyTarget,
  config: UnifiedConfig,
  managementTimeoutMs: number
): ModelPipelinePublicationClient {
  const managementKey = target.isRemote
    ? target.managementKey
    : config.cliproxy.auth?.management_secret;
  if (!managementKey) {
    throw new ConfigError(
      target.isRemote
        ? 'cliproxy_server.remote.management_key is required for model pipeline publication'
        : 'cliproxy.auth.management_secret is required for model pipeline publication'
    );
  }
  return new ManagementApiClient({
    host: target.host,
    port: target.port,
    protocol: target.protocol,
    managementKey,
    timeout: managementTimeoutMs,
    allowSelfSigned: target.allowSelfSigned,
  });
}

function readManagementTimeout(config: UnifiedConfig): number {
  const value = config.cliproxy_server?.management_timeout_ms;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ConfigError('cliproxy_server.management_timeout_ms must be a positive whole number');
  }
  return value;
}

const defaultDependencies: ModelPipelinePublisherDependencies = {
  loadConfig() {
    const config = loadUnifiedConfig();
    if (!config) {
      throw new ConfigError('CCS config.yaml is required for model pipeline publication');
    }
    return config;
  },
  persistPipeline(pipeline, expectedActive) {
    return mutateConfig((config) => replaceModelPipeline(config, pipeline, expectedActive));
  },
  renderConfig: renderUnifiedConfigForPublication,
  resolveTarget(config) {
    return resolveProxyTarget(config.cliproxy_server);
  },
  createClient: createDefaultClient,
  snapshotSchemaDigest: getModelPipelineSnapshotSchemaDigest,
  ccsBinary: getBuildProvenance,
  withTransaction: withModelPipelineTransactionLock,
};

function proposedIdentity(
  request: ModelPipelinePublicationRequest,
  configYaml: string
): ActiveIdentityV2 {
  const routing = projectModelRouting(request.snapshot);
  return {
    generation: request.snapshot.generation,
    snapshot_digest: request.snapshot.snapshot_digest,
    projection_digest: routing['projection-digest'],
    config_digest: sha256Digest(Buffer.from(configYaml, 'utf8')),
  };
}

function assertIntentCoherent(intent: ModelPipelinePublicationIntent): void {
  const expected = proposedIdentity(intent.request, intent.config_yaml);
  if (!identitiesEqual(intent.proposed_active, expected)) {
    throw new ConfigError(
      'publication intent proposed identity does not match its snapshot and YAML'
    );
  }
  if (intent.routing_schema_digest !== intent.request.snapshot.inventory.routing_schema.digest) {
    throw new ConfigError('publication intent routing schema digest does not match its snapshot');
  }
}

function assertActivationReceipt(
  intent: ModelPipelinePublicationIntent,
  receipt: CLIProxyActivationReceipt
): void {
  assertIdentity(
    receipt.previous_active,
    intent.request.expected_active,
    'CLIProxy receipt previous_active'
  );
  assertIdentity(receipt.active, intent.proposed_active, 'CLIProxy receipt active');
  if (receipt.routing_schema.digest !== intent.routing_schema_digest) {
    throw new ConfigError(
      'CLIProxy receipt routing schema digest does not match publication intent'
    );
  }
}

function assertActivatedReadback(
  intent: ModelPipelinePublicationIntent,
  inventory: ModelPipelineInventory,
  configYaml: string,
  activationReceipt?: CLIProxyActivationReceipt
): void {
  assertIdentity(inventory.active, intent.proposed_active, 'CLIProxy inventory active identity');
  if (inventory.activation_loaded_at === null) {
    throw new ConfigError('CLIProxy inventory omitted activation_loaded_at for active routing');
  }
  if (inventory.routing_schema.digest !== intent.routing_schema_digest) {
    throw new ConfigError(
      'CLIProxy inventory routing schema digest does not match publication intent'
    );
  }
  if (sha256Digest(Buffer.from(configYaml, 'utf8')) !== intent.proposed_active.config_digest) {
    throw new ConfigError('CLIProxy readback bytes do not match the staged config digest');
  }
  if (configYaml !== intent.config_yaml) {
    throw new ConfigError('CLIProxy readback YAML differs from the exact staged bytes');
  }
  if (activationReceipt) {
    assertActivationReceipt(intent, activationReceipt);
    if (activationReceipt.loaded_at !== inventory.activation_loaded_at) {
      throw new ConfigError('CLIProxy receipt and inventory activation timestamps differ');
    }
    if (!provenanceEqual(activationReceipt.binary_provenance, inventory.binary_provenance)) {
      throw new ConfigError('CLIProxy receipt and inventory binary provenance differ');
    }
  }
}

function composeReceipt(
  intent: ModelPipelinePublicationIntent,
  inventory: ModelPipelineInventory
): PublicationReceiptV2 {
  if (inventory.activation_loaded_at === null) {
    throw new ConfigError('cannot compose publication receipt without activation_loaded_at');
  }
  return {
    schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
    ok: true,
    previous_active: intent.request.expected_active,
    active: intent.proposed_active,
    snapshot_schema_digest: intent.snapshot_schema_digest,
    routing_schema_digest: intent.routing_schema_digest,
    ccs_binary: intent.ccs_binary,
    cliproxy_binary: inventory.binary_provenance,
    loaded_at: inventory.activation_loaded_at,
  };
}

export class ModelPipelinePublisher {
  private readonly dependencies: ModelPipelinePublisherDependencies;

  constructor(dependencies: ModelPipelinePublisherDependencies) {
    this.dependencies = dependencies;
  }

  async publish(value: unknown, signal?: AbortSignal): Promise<VerifiedModelPipelinePublication> {
    const request = parseModelPipelinePublicationRequest(value);
    try {
      return await this.dependencies.withTransaction(async (store) => {
        assertNotCancelled(signal);
        await this.recoverPendingIntent(store, signal);
        return this.publishOne(store, request, signal);
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      const statusCode = (error as { readonly statusCode?: unknown } | undefined)?.statusCode;
      if (
        code === 'ELOCKED' ||
        code === 'ENOTACQUIRED' ||
        statusCode === 409 ||
        statusCode === 412
      ) {
        throw new ModelPipelineGenerationConflictError(
          statusCode === 409 || statusCode === 412
            ? 'CLIProxy rejected the model pipeline compare-and-swap precondition'
            : 'another CCS process owns the model pipeline publication transaction',
          error
        );
      }
      throw error;
    }
  }

  async read(signal?: AbortSignal): Promise<ModelPipelineConfig> {
    return this.dependencies.withTransaction(async (store) => {
      assertNotCancelled(signal);
      await this.recoverPendingIntent(store, signal);
      return this.readOne(signal);
    });
  }

  private resolveCycle(): {
    readonly config: UnifiedConfig;
    readonly client: ModelPipelinePublicationClient;
  } {
    const config = this.dependencies.loadConfig();
    const managementTimeoutMs = readManagementTimeout(config);
    const target = this.dependencies.resolveTarget(config);
    return {
      config,
      client: this.dependencies.createClient(target, config, managementTimeoutMs),
    };
  }

  private async publishOne(
    store: ModelPipelineTransactionStore,
    request: ModelPipelinePublicationRequest,
    signal?: AbortSignal
  ): Promise<PublicationReceiptV2> {
    assertNotCancelled(signal);
    const { config, client } = this.resolveCycle();
    const inventory = await client.getModelInventory(signal);
    assertTransition(request, config.model_pipeline, inventory);
    const activeConfigYaml = await client.getConfigYaml(signal);
    const configYaml = this.dependencies.renderConfig(activeConfigYaml, request.snapshot);
    const intent: ModelPipelinePublicationIntent = {
      schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
      request,
      proposed_active: proposedIdentity(request, configYaml),
      snapshot_schema_digest: this.dependencies.snapshotSchemaDigest(),
      routing_schema_digest: request.snapshot.inventory.routing_schema.digest,
      ccs_binary: this.dependencies.ccsBinary(),
      config_yaml: configYaml,
    };
    assertIntentCoherent(intent);
    store.writeIntent(intent);
    return this.activateAndPersist(store, intent, client, signal);
  }

  private async recoverPendingIntent(
    store: ModelPipelineTransactionStore,
    signal?: AbortSignal
  ): Promise<void> {
    const intent = store.readIntent();
    if (!intent) return;
    assertIntentCoherent(intent);
    const { client } = this.resolveCycle();
    await this.activateAndPersist(store, intent, client, signal);
  }

  private async activateAndPersist(
    store: ModelPipelineTransactionStore,
    intent: ModelPipelinePublicationIntent,
    client: ModelPipelinePublicationClient,
    signal?: AbortSignal
  ): Promise<PublicationReceiptV2> {
    assertNotCancelled(signal);
    let inventory = await client.getModelInventory(signal);
    let activationReceipt: CLIProxyActivationReceipt | undefined;
    if (identitiesEqual(inventory.active, intent.request.expected_active)) {
      activationReceipt = await client.putConfigYaml(
        intent.config_yaml,
        intent.request.expected_active,
        signal
      );
      assertActivationReceipt(intent, activationReceipt);
      inventory = await client.getModelInventory(signal);
    } else if (!identitiesEqual(inventory.active, intent.proposed_active)) {
      throw new ModelPipelineGenerationConflictError(
        'CLIProxy is in a third state that matches neither expected_active nor proposed_active'
      );
    }
    const configYaml = await client.getConfigYaml(signal);
    assertActivatedReadback(intent, inventory, configYaml, activationReceipt);
    const receipt = composeReceipt(intent, inventory);
    const pipeline: ModelPipelineConfig = {
      schema_version: MODEL_PIPELINE_SCHEMA_VERSION,
      snapshot: intent.request.snapshot,
      receipt,
    };
    this.dependencies.persistPipeline(pipeline, intent.request.expected_active);
    store.removeIntent();
    return receipt;
  }

  private async readOne(signal?: AbortSignal): Promise<ModelPipelineConfig> {
    assertNotCancelled(signal);
    const { config, client } = this.resolveCycle();
    const pipeline = config.model_pipeline;
    if (!pipeline) throw new ModelPipelineSnapshotNotFoundError();
    const inventory = await client.getModelInventory(signal);
    assertIdentity(inventory.active, pipeline.receipt.active, 'CLIProxy inventory active identity');
    if (inventory.activation_loaded_at !== pipeline.receipt.loaded_at) {
      throw new ConfigError('CLIProxy activation timestamp differs from the persisted CCS receipt');
    }
    if (!provenanceEqual(inventory.binary_provenance, pipeline.receipt.cliproxy_binary)) {
      throw new ConfigError('CLIProxy binary provenance differs from the persisted CCS receipt');
    }
    if (inventory.routing_schema.digest !== pipeline.receipt.routing_schema_digest) {
      throw new ConfigError('CLIProxy routing schema differs from the persisted CCS receipt');
    }
    const configYaml = await client.getConfigYaml(signal);
    if (sha256Digest(Buffer.from(configYaml, 'utf8')) !== pipeline.receipt.active.config_digest) {
      throw new ConfigError('CLIProxy config bytes differ from the persisted CCS config_digest');
    }
    return pipeline;
  }
}

const defaultPublisher = new ModelPipelinePublisher(defaultDependencies);

export function publishModelPipeline(
  value: unknown,
  signal?: AbortSignal
): Promise<VerifiedModelPipelinePublication> {
  return defaultPublisher.publish(value, signal);
}

export function readVerifiedModelPipeline(signal?: AbortSignal): Promise<ModelPipelineConfig> {
  return defaultPublisher.read(signal);
}
