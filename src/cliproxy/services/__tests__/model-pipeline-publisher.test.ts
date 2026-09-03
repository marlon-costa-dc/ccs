import { describe, expect, it, mock } from 'bun:test';
import { modelPipelineRequestFixture } from '../../../config/schemas/__tests__/fixtures/model-pipeline-v3-fixture';
import {
  parseModelPipelinePublicationRequest,
  type ActiveIdentityV3,
  type ModelPipelineConfig,
  type ModelPipelineInventory,
  type ModelPipelinePublicationRequest,
  type PublicationReceiptV3,
} from '../../../config/schemas/model-pipeline';
import {
  createEmptyUnifiedConfig,
  type UnifiedConfig,
} from '../../../config/schemas/unified-config';
import { ConfigError, UserAbortError } from '../../../errors/error-types';
import { sha256Digest } from '../../../utils/canonical-json';
import type { CLIProxyActivationReceipt } from '../../management/management-api-types';
import type { ProxyTarget } from '../../proxy/proxy-target-resolver';
import { projectModelRouting } from '../../config/model-routing-projector';
import {
  ModelPipelineGenerationConflictError,
  ModelPipelinePublisher,
  ModelPipelineSnapshotNotFoundError,
  replaceModelPipeline,
  type ModelPipelinePublisherDependencies,
} from '../model-pipeline-publisher';
import type {
  ModelPipelinePublicationIntent,
  ModelPipelineTransactionStore,
} from '../model-pipeline-transaction-store';

const request = parseModelPipelinePublicationRequest(modelPipelineRequestFixture());
const activeConfigYaml = 'port: 8317\n';
const stagedConfigYaml = 'port: 8317\nmodel-routing:\n  schema-version: 2\n';
const loadedAt = '2026-08-28T11:20:57Z';
const snapshotSchemaDigest =
  'sha256:eb4ad24d88c652f4f1da9d6cfc5c3a22380a0f7bf38cf1549b7fcee320074aa0';
const ccsBinary = {
  version: 'ccs-fixture-v3',
  commit: 'ccs-fixture-commit',
  built_at: '2026-08-28T11:15:00Z',
};
const proposedActive: ActiveIdentityV3 = {
  generation: request.snapshot.generation,
  snapshot_digest: request.snapshot.snapshot_digest,
  projection_digest: projectModelRouting(request.snapshot)['projection-digest'],
  config_digest: sha256Digest(Buffer.from(stagedConfigYaml, 'utf8')),
};
const target: ProxyTarget = {
  host: '127.0.0.1',
  port: 8317,
  protocol: 'http',
  allowSelfSigned: false,
  managementTimeoutMs: 2_000,
  isRemote: false,
};

function configWith(pipeline?: ModelPipelineConfig): UnifiedConfig {
  const config = createEmptyUnifiedConfig();
  if (pipeline) config.model_pipeline = pipeline;
  if (!config.cliproxy_server) throw new ConfigError('test cliproxy_server missing');
  config.cliproxy_server.management_timeout_ms = 2_000;
  return config;
}

function changeObservedAt(inventory: ModelPipelineInventory, value: string): void {
  for (const model of inventory.direct_models) {
    for (const route of model.routes) {
      route.health.observed_at = value;
      for (const credential of route.credentials) credential.health.observed_at = value;
    }
  }
}

function initialInventory(): ModelPipelineInventory {
  const inventory = structuredClone(request.snapshot.inventory);
  changeObservedAt(inventory, '2026-08-28T11:21:30Z');
  return inventory;
}

function activatedInventory(): ModelPipelineInventory {
  const inventory = initialInventory();
  inventory.active = proposedActive;
  inventory.activation_loaded_at = loadedAt;
  changeObservedAt(inventory, '2026-08-28T11:22:00Z');
  return inventory;
}

function activationReceipt(
  overrides: Partial<CLIProxyActivationReceipt> = {}
): CLIProxyActivationReceipt {
  return {
    previous_active: null,
    active: proposedActive,
    routing_schema: request.snapshot.inventory.routing_schema,
    binary_provenance: request.snapshot.inventory.binary_provenance,
    loaded_at: loadedAt,
    ...overrides,
  };
}

function publicationReceipt(): PublicationReceiptV3 {
  return {
    schema_version: 3,
    ok: true,
    previous_active: null,
    active: proposedActive,
    snapshot_schema_digest: snapshotSchemaDigest,
    routing_schema_digest: request.snapshot.inventory.routing_schema.digest,
    ccs_binary: ccsBinary,
    cliproxy_binary: request.snapshot.inventory.binary_provenance,
    loaded_at: loadedAt,
  };
}

function persistedPipeline(): ModelPipelineConfig {
  return { schema_version: 3, snapshot: request.snapshot, receipt: publicationReceipt() };
}

interface DependencyHarness {
  readonly dependencies: ModelPipelinePublisherDependencies;
  readonly config: UnifiedConfig;
  readonly events: string[];
  getPersisted(): ModelPipelineConfig | undefined;
}

function dependencyHarness(options?: {
  readonly initial?: ModelPipelineInventory;
  readonly activated?: ModelPipelineInventory;
  readonly persisted?: ModelPipelineConfig;
  readonly activationReceipt?: CLIProxyActivationReceipt;
}): DependencyHarness {
  const events: string[] = [];
  const config = configWith(options?.persisted);
  let persisted = options?.persisted;
  let intent: ModelPipelinePublicationIntent | null = null;
  let inventoryReads = 0;
  let configReads = 0;
  const store = {
    readIntent() {
      events.push('intent:read');
      return intent;
    },
    writeIntent(value: ModelPipelinePublicationIntent) {
      events.push('intent:write');
      intent = value;
    },
    removeIntent() {
      events.push('intent:remove');
      intent = null;
    },
  } as ModelPipelineTransactionStore;
  const initial = options?.initial ?? initialInventory();
  const activated = options?.activated ?? activatedInventory();
  const receipt = options?.activationReceipt ?? activationReceipt();

  const dependencies: ModelPipelinePublisherDependencies = {
    loadConfig: mock(() => {
      events.push('load');
      return config;
    }),
    persistPipeline: mock((incoming, expectedActive) => {
      events.push('persist');
      replaceModelPipeline(config, incoming, expectedActive);
      persisted = incoming;
      return config;
    }),
    renderConfig: mock((yaml, snapshot) => {
      events.push(
        `render:${yaml === activeConfigYaml}:${snapshot.snapshot_digest === request.snapshot.snapshot_digest}`
      );
      return stagedConfigYaml;
    }),
    resolveTarget: mock(() => {
      events.push('target');
      return target;
    }),
    createClient: mock(() => ({
      async getConfigYaml() {
        configReads += 1;
        events.push(`yaml:${configReads}`);
        return configReads === 1 ? activeConfigYaml : stagedConfigYaml;
      },
      async putConfigYaml(configYaml: string, expectedActive: ActiveIdentityV3 | null) {
        events.push('put');
        expect(configYaml).toBe(stagedConfigYaml);
        expect(expectedActive).toBeNull();
        return receipt;
      },
      async getModelInventory() {
        inventoryReads += 1;
        events.push(`inventory:${inventoryReads}`);
        return inventoryReads <= 2 ? initial : activated;
      },
    })),
    snapshotSchemaDigest: () => snapshotSchemaDigest,
    ccsBinary: () => ccsBinary,
    withTransaction: (operation) => operation(store),
  };
  return {
    dependencies,
    config,
    events,
    getPersisted: () => persisted,
  };
}

describe('model pipeline v3 publisher', () => {
  it('durably stages, activates, reads exact bytes, and persists one bootstrap generation', async () => {
    const harness = dependencyHarness();
    const publisher = new ModelPipelinePublisher(harness.dependencies);

    await expect(publisher.publish(modelPipelineRequestFixture())).resolves.toEqual(
      publicationReceipt()
    );
    expect(harness.getPersisted()).toEqual(persistedPipeline());
    expect(harness.events).toEqual([
      'intent:read',
      'load',
      'target',
      'inventory:1',
      'yaml:1',
      'render:true:true',
      'intent:write',
      'inventory:2',
      'put',
      'inventory:3',
      'yaml:2',
      'persist',
      'intent:remove',
    ]);
  });

  it('accepts refreshed observation instants but preserves every other routing fact', async () => {
    const harness = dependencyHarness();
    await expect(
      new ModelPipelinePublisher(harness.dependencies).publish(modelPipelineRequestFixture())
    ).resolves.toEqual(publicationReceipt());

    const stale = initialInventory();
    stale.direct_models[0]!.routes[0]!.health.status = 'degraded';
    const rejected = dependencyHarness({ initial: stale });
    await expect(
      new ModelPipelinePublisher(rejected.dependencies).publish(modelPipelineRequestFixture())
    ).rejects.toThrow('snapshot inventory model or alias facts are stale relative to CLIProxy');
    expect(rejected.events).not.toContain('put');
    expect(rejected.events).not.toContain('persist');
  });

  it('rejects activation receipt drift before read-back or persistence', async () => {
    const drifted = activationReceipt({
      active: { ...proposedActive, config_digest: `sha256:${'f'.repeat(64)}` },
    });
    const harness = dependencyHarness({ activationReceipt: drifted });

    await expect(
      new ModelPipelinePublisher(harness.dependencies).publish(modelPipelineRequestFixture())
    ).rejects.toThrow('CLIProxy receipt active does not match expected identity');
    expect(harness.events).not.toContain('inventory:3');
    expect(harness.events).not.toContain('persist');
  });

  it('rejects activated inventory or YAML drift and never persists it', async () => {
    const driftedInventory = activatedInventory();
    driftedInventory.active = {
      ...proposedActive,
      snapshot_digest: `sha256:${'f'.repeat(64)}`,
    };
    const inventoryHarness = dependencyHarness({ activated: driftedInventory });
    await expect(
      new ModelPipelinePublisher(inventoryHarness.dependencies).publish(
        modelPipelineRequestFixture()
      )
    ).rejects.toThrow('CLIProxy inventory active identity does not match expected identity');
    expect(inventoryHarness.events).not.toContain('persist');

    const yamlHarness = dependencyHarness();
    const createClient = yamlHarness.dependencies.createClient;
    yamlHarness.dependencies.createClient = (resolvedTarget, config) => {
      const client = createClient(resolvedTarget, config);
      return {
        ...client,
        async getConfigYaml(signal) {
          const value = await client.getConfigYaml(signal);
          return value === stagedConfigYaml ? `${value}drift: true\n` : value;
        },
      };
    };
    await expect(
      new ModelPipelinePublisher(yamlHarness.dependencies).publish(modelPipelineRequestFixture())
    ).rejects.toThrow('CLIProxy readback bytes do not match the staged config digest');
    expect(yamlHarness.events).not.toContain('persist');
  });

  it('verifies active inventory provenance and exact config bytes before serving persisted state', async () => {
    const harness = dependencyHarness({ persisted: persistedPipeline() });
    let inventoryRead = false;
    harness.dependencies.createClient = () => ({
      async getModelInventory() {
        inventoryRead = true;
        const restarted = activatedInventory();
        restarted.activation_loaded_at = '2026-08-28T12:11:08Z';
        return restarted;
      },
      async getConfigYaml() {
        return stagedConfigYaml;
      },
      async putConfigYaml() {
        throw new Error('read must not activate');
      },
    });
    await expect(new ModelPipelinePublisher(harness.dependencies).read()).resolves.toEqual(
      persistedPipeline()
    );
    expect(inventoryRead).toBe(true);

    const absent = dependencyHarness();
    await expect(new ModelPipelinePublisher(absent.dependencies).read()).rejects.toBeInstanceOf(
      ModelPipelineSnapshotNotFoundError
    );
    expect(absent.events).not.toContain('inventory:1');
  });

  it('propagates pre-cancellation without creating an intent or external request', async () => {
    const harness = dependencyHarness();
    const controller = new AbortController();
    controller.abort(new UserAbortError('operator cancelled publication'));

    await expect(
      new ModelPipelinePublisher(harness.dependencies).publish(
        modelPipelineRequestFixture(),
        controller.signal
      )
    ).rejects.toThrow('operator cancelled publication');
    expect(harness.events).toEqual([]);
  });

  it('enforces exact persisted CAS identity and idempotent bytes', () => {
    const current = persistedPipeline();
    const config = configWith(current);
    expect(() => replaceModelPipeline(config, structuredClone(current), null)).not.toThrow();

    const collision = structuredClone(current);
    collision.receipt.loaded_at = '2026-08-28T11:21:58Z';
    expect(() => replaceModelPipeline(config, collision, null)).toThrow(
      'proposed identity with different snapshot or receipt bytes'
    );

    const different = structuredClone(current);
    different.receipt.active = {
      ...different.receipt.active,
      config_digest: `sha256:${'e'.repeat(64)}`,
    };
    expect(() => replaceModelPipeline(config, different, null)).toThrow(
      ModelPipelineGenerationConflictError
    );
    expect(() => replaceModelPipeline(config, different, null)).toThrow(
      'bootstrap requires no persisted active identity'
    );
  });
});
