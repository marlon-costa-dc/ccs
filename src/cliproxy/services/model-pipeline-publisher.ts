import type { UnifiedConfig } from '../../config/unified-config-types';
import { loadUnifiedConfig, mutateConfig } from '../../config/config-loader-facade';
import {
  parseModelPipelineConfig,
  type ModelPipelineConfig,
  type ModelPipelineInventory,
} from '../../config/schemas/model-pipeline';
import { ConfigError, UserAbortError } from '../../errors/error-types';
import { renderUnifiedConfigForPublication } from '../config/generator';
import { ManagementApiClient } from '../management/management-api-client';
import type { ConfigPublicationReceipt } from '../management/management-api-types';
import { resolveProxyTarget, type ProxyTarget } from '../proxy/proxy-target-resolver';

export interface ModelPipelinePublicationClient {
  getConfigYaml(signal?: AbortSignal): Promise<string>;
  putConfigYaml(configYaml: string, signal?: AbortSignal): Promise<ConfigPublicationReceipt>;
  getModelInventory(signal?: AbortSignal): Promise<ModelPipelineInventory>;
}

export interface ModelPipelinePublisherDependencies {
  loadConfig(): UnifiedConfig;
  persistPipeline(pipeline: ModelPipelineConfig): UnifiedConfig;
  renderConfig(config: UnifiedConfig, port: number, activeConfigYaml: string): string;
  resolveTarget(config: UnifiedConfig): ProxyTarget;
  createClient(
    target: ProxyTarget,
    config: UnifiedConfig,
    managementTimeoutMs: number
  ): ModelPipelinePublicationClient;
}

export interface VerifiedModelPipelinePublication extends ConfigPublicationReceipt {
  readonly loaded_at: string;
  readonly binary_provenance: ModelPipelineInventory['binary_provenance'];
}

export class ModelPipelineGenerationConflictError extends ConfigError {
  constructor(message: string) {
    super(message);
    this.name = 'ModelPipelineGenerationConflictError';
  }
}

export class ModelPipelineSnapshotNotFoundError extends ConfigError {
  constructor() {
    super('Model pipeline snapshot not found');
    this.name = 'ModelPipelineSnapshotNotFoundError';
  }
}

export function replaceModelPipeline(config: UnifiedConfig, incoming: ModelPipelineConfig): void {
  const current = config.model_pipeline;
  if (current) {
    const currentGeneration = current.snapshot.generation;
    const incomingGeneration = incoming.snapshot.generation;
    if (incomingGeneration < currentGeneration) {
      throw new ModelPipelineGenerationConflictError(
        `model_pipeline generation ${incomingGeneration} is older than active generation ${currentGeneration}`
      );
    }
    if (
      incomingGeneration === currentGeneration &&
      incoming.snapshot.snapshot_digest !== current.snapshot.snapshot_digest
    ) {
      throw new ModelPipelineGenerationConflictError(
        `model_pipeline generation ${incomingGeneration} already exists with a different snapshot_digest`
      );
    }
  }
  config.model_pipeline = incoming;
}

function assertReceipt(expected: ModelPipelineConfig, receipt: ConfigPublicationReceipt): void {
  const snapshot = expected.snapshot;
  if (receipt.generation !== snapshot.generation) {
    throw new ConfigError(
      `CLIProxy receipt generation mismatch: expected ${snapshot.generation}, got ${receipt.generation}`
    );
  }
  if (receipt.snapshot_digest !== snapshot.snapshot_digest) {
    throw new ConfigError(
      `CLIProxy receipt snapshot_digest mismatch: expected ${snapshot.snapshot_digest}, got ${receipt.snapshot_digest}`
    );
  }
  if (receipt.projection_digest !== snapshot.projection_digest) {
    throw new ConfigError(
      `CLIProxy receipt projection_digest mismatch: expected ${snapshot.projection_digest}, got ${receipt.projection_digest}`
    );
  }
}

function assertActiveInventory(
  expected: ModelPipelineConfig,
  inventory: ModelPipelineInventory
): NonNullable<ModelPipelineInventory['active']> {
  const active = inventory.active;
  if (!active) {
    throw new ConfigError('CLIProxy inventory did not report an active model-routing snapshot');
  }
  const snapshot = expected.snapshot;
  if (active.generation !== snapshot.generation) {
    throw new ConfigError(
      `CLIProxy active generation mismatch: expected ${snapshot.generation}, got ${active.generation}`
    );
  }
  if (active.snapshot_digest !== snapshot.snapshot_digest) {
    throw new ConfigError(
      `CLIProxy active snapshot_digest mismatch: expected ${snapshot.snapshot_digest}, got ${active.snapshot_digest}`
    );
  }
  if (active.projection_digest !== snapshot.projection_digest) {
    throw new ConfigError(
      `CLIProxy active projection_digest mismatch: expected ${snapshot.projection_digest}, got ${active.projection_digest}`
    );
  }
  return active;
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new UserAbortError('Model pipeline publication cancelled');
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
  persistPipeline(pipeline) {
    return mutateConfig((config) => replaceModelPipeline(config, pipeline));
  },
  renderConfig: renderUnifiedConfigForPublication,
  resolveTarget(config) {
    return resolveProxyTarget(config.cliproxy_server);
  },
  createClient: createDefaultClient,
};

export class ModelPipelinePublisher {
  private publicationTail: Promise<void> = Promise.resolve();
  private readonly dependencies: ModelPipelinePublisherDependencies;

  constructor(dependencies: ModelPipelinePublisherDependencies) {
    this.dependencies = dependencies;
  }

  publish(value: unknown, signal?: AbortSignal): Promise<VerifiedModelPipelinePublication> {
    let pipeline: ModelPipelineConfig;
    try {
      pipeline = parseModelPipelineConfig(value);
    } catch (error) {
      return Promise.reject(error);
    }

    const operation = this.publicationTail.then(() => {
      assertNotCancelled(signal);
      return this.publishOne(pipeline, signal);
    });
    this.publicationTail = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  read(signal?: AbortSignal): Promise<ModelPipelineConfig> {
    return this.publicationTail.then(() => {
      assertNotCancelled(signal);
      return this.readOne(signal);
    });
  }

  private async publishOne(
    pipeline: ModelPipelineConfig,
    signal?: AbortSignal
  ): Promise<VerifiedModelPipelinePublication> {
    assertNotCancelled(signal);
    const config = structuredClone(this.dependencies.loadConfig());
    replaceModelPipeline(config, pipeline);
    const managementTimeoutMs = readManagementTimeout(config);
    const target = this.dependencies.resolveTarget(config);
    const client = this.dependencies.createClient(target, config, managementTimeoutMs);
    const activeConfigYaml = await client.getConfigYaml(signal);
    const configYaml = this.dependencies.renderConfig(config, target.port, activeConfigYaml);
    const receipt = await client.putConfigYaml(configYaml, signal);
    assertReceipt(pipeline, receipt);
    const inventory = await client.getModelInventory(signal);
    const active = assertActiveInventory(pipeline, inventory);
    this.dependencies.persistPipeline(pipeline);
    return {
      ...receipt,
      loaded_at: active.loaded_at,
      binary_provenance: inventory.binary_provenance,
    };
  }

  private async readOne(signal?: AbortSignal): Promise<ModelPipelineConfig> {
    assertNotCancelled(signal);
    const config = this.dependencies.loadConfig();
    const pipeline = config.model_pipeline;
    if (!pipeline) {
      throw new ModelPipelineSnapshotNotFoundError();
    }
    const managementTimeoutMs = readManagementTimeout(config);
    const target = this.dependencies.resolveTarget(config);
    const client = this.dependencies.createClient(target, config, managementTimeoutMs);
    const inventory = await client.getModelInventory(signal);
    assertActiveInventory(pipeline, inventory);
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
