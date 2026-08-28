import { describe, expect, it, mock } from 'bun:test';
import fixture from '../../../config/schemas/__tests__/fixtures/model-pipeline-snapshot-v1.json';
import {
  parseModelPipelineConfig,
  type ModelPipelineConfig,
  type ModelPipelineInventory,
} from '../../../config/schemas/model-pipeline';
import {
  createEmptyUnifiedConfig,
  type UnifiedConfig,
} from '../../../config/schemas/unified-config';
import { ConfigError, UserAbortError } from '../../../errors/error-types';
import type { ConfigPublicationReceipt } from '../../management/management-api-types';
import type { ProxyTarget } from '../../proxy/proxy-target-resolver';
import {
  ModelPipelineGenerationConflictError,
  ModelPipelinePublisher,
  ModelPipelineSnapshotNotFoundError,
  replaceModelPipeline,
  type ModelPipelinePublisherDependencies,
} from '../model-pipeline-publisher';

const pipeline = parseModelPipelineConfig(fixture.model_pipeline);
const target: ProxyTarget = {
  host: '127.0.0.1',
  port: 8317,
  protocol: 'http',
  allowSelfSigned: false,
  managementTimeoutMs: 2_000,
  isRemote: false,
};

function configuredPipeline(): UnifiedConfig {
  const config = createEmptyUnifiedConfig();
  config.model_pipeline = pipeline;
  if (!config.cliproxy_server) throw new ConfigError('test cliproxy_server missing');
  config.cliproxy_server.management_timeout_ms = 2_000;
  return config;
}

function receipt(overrides: Partial<ConfigPublicationReceipt> = {}): ConfigPublicationReceipt {
  return {
    ok: true,
    generation: pipeline.snapshot.generation,
    snapshot_digest: pipeline.snapshot.snapshot_digest,
    projection_digest: pipeline.snapshot.projection_digest,
    ...overrides,
  };
}

function activeInventory(): ModelPipelineInventory {
  const inventory = structuredClone(pipeline.snapshot.inventory);
  inventory.active = {
    generation: pipeline.snapshot.generation,
    snapshot_digest: pipeline.snapshot.snapshot_digest,
    projection_digest: pipeline.snapshot.projection_digest,
    loaded_at: '2026-08-27T19:00:00Z',
  };
  return inventory;
}

function dependencies(events: string[] = []): ModelPipelinePublisherDependencies {
  const config = configuredPipeline();
  return {
    loadConfig: mock((): UnifiedConfig => {
      events.push('load');
      return config;
    }),
    persistPipeline: mock((_incoming: ModelPipelineConfig): UnifiedConfig => {
      events.push('persist');
      return config;
    }),
    renderConfig: mock((_config: UnifiedConfig, port: number): string => {
      events.push(`render:${port}`);
      return 'port: 8317\nmodel-routing:\n  schema-version: 1\n';
    }),
    resolveTarget: mock((_config: UnifiedConfig): ProxyTarget => {
      events.push('target');
      return target;
    }),
    createClient: mock(() => ({
      putConfigYaml: async (content: string) => {
        events.push(`put:${content.includes('model-routing:')}`);
        return receipt();
      },
      getModelInventory: async () => {
        events.push('inventory');
        return activeInventory();
      },
    })),
  };
}

describe('model pipeline publisher', () => {
  it('persists, renders, publishes and confirms one exact generation in order', async () => {
    const events: string[] = [];
    const publisher = new ModelPipelinePublisher(dependencies(events));

    const published = await publisher.publish(pipeline);

    expect(events).toEqual(['load', 'target', 'render:8317', 'put:true', 'inventory', 'persist']);
    expect(published).toEqual({
      ...receipt(),
      loaded_at: '2026-08-27T19:00:00Z',
      binary_provenance: pipeline.snapshot.inventory.binary_provenance,
    });
  });

  it('fails closed before inventory confirmation when the reload receipt drifts', async () => {
    const deps = dependencies();
    const persistPipeline = deps.persistPipeline;
    const getModelInventory = mock(async () => activeInventory());
    deps.createClient = () => ({
      putConfigYaml: async () => receipt({ generation: 43 }),
      getModelInventory,
    });
    const publisher = new ModelPipelinePublisher(deps);

    await expect(publisher.publish(pipeline)).rejects.toThrow(
      'CLIProxy receipt generation mismatch: expected 42, got 43'
    );
    expect(getModelInventory).not.toHaveBeenCalled();
    expect(persistPipeline).not.toHaveBeenCalled();
  });

  it('fails closed when GET inventory does not confirm the loaded digests', async () => {
    const deps = dependencies();
    const persistPipeline = deps.persistPipeline;
    const inventory = activeInventory();
    inventory.active!.snapshot_digest = `sha256:${'f'.repeat(64)}`;
    deps.createClient = () => ({
      putConfigYaml: async () => receipt(),
      getModelInventory: async () => inventory,
    });
    const publisher = new ModelPipelinePublisher(deps);

    await expect(publisher.publish(pipeline)).rejects.toThrow(
      'CLIProxy active snapshot_digest mismatch'
    );
    expect(persistPipeline).not.toHaveBeenCalled();
  });

  it('verifies active inventory before serving the persisted snapshot', async () => {
    const deps = dependencies();
    const publisher = new ModelPipelinePublisher(deps);

    await expect(publisher.read()).resolves.toEqual(pipeline);

    const inventory = activeInventory();
    inventory.active!.projection_digest = `sha256:${'f'.repeat(64)}`;
    deps.createClient = () => ({
      putConfigYaml: async () => receipt(),
      getModelInventory: async () => inventory,
    });
    await expect(publisher.read()).rejects.toThrow('CLIProxy active projection_digest mismatch');
  });

  it('uses a typed absence only when bootstrap has no persisted snapshot', async () => {
    const deps = dependencies();
    const config = configuredPipeline();
    delete config.model_pipeline;
    deps.loadConfig = () => config;
    const publisher = new ModelPipelinePublisher(deps);

    await expect(publisher.read()).rejects.toBeInstanceOf(ModelPipelineSnapshotNotFoundError);
    expect(deps.createClient).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, -1, 1.5, '2000'])(
    'rejects invalid management timeout %p before rendering or publishing',
    async (managementTimeout) => {
      const events: string[] = [];
      const deps = dependencies(events);
      const config = configuredPipeline();
      if (!config.cliproxy_server) throw new ConfigError('test cliproxy_server missing');
      config.cliproxy_server.management_timeout_ms = managementTimeout as number | undefined;
      deps.loadConfig = () => config;
      const publisher = new ModelPipelinePublisher(deps);

      await expect(publisher.publish(pipeline)).rejects.toThrow(
        'cliproxy_server.management_timeout_ms must be a positive whole number'
      );
      expect(events).toEqual([]);
      expect(deps.persistPipeline).not.toHaveBeenCalled();
    }
  );

  it('propagates cancellation without publishing or persisting', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    const controller = new AbortController();
    controller.abort(new UserAbortError('operator cancelled publication'));
    const publisher = new ModelPipelinePublisher(deps);

    await expect(publisher.publish(pipeline, controller.signal)).rejects.toThrow(
      'operator cancelled publication'
    );
    expect(events).toEqual([]);
    expect(deps.persistPipeline).not.toHaveBeenCalled();
  });

  it('aborts an in-flight publication and never confirms or persists it', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    deps.createClient = () => ({
      putConfigYaml: async (_content, signal) =>
        new Promise<ConfigPublicationReceipt>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      getModelInventory: async () => {
        events.push('unexpected-inventory');
        return activeInventory();
      },
    });
    const controller = new AbortController();
    const publisher = new ModelPipelinePublisher(deps);
    const publication = publisher.publish(pipeline, controller.signal);
    await Promise.resolve();
    await Promise.resolve();
    controller.abort(new UserAbortError('connection closed'));

    await expect(publication).rejects.toThrow('connection closed');
    expect(events).not.toContain('unexpected-inventory');
    expect(events).not.toContain('persist');
  });

  it('propagates local atomic persistence failure after remote verification', async () => {
    const deps = dependencies();
    deps.persistPipeline = () => {
      throw new ConfigError('cannot atomically persist CCS config');
    };
    const publisher = new ModelPipelinePublisher(deps);

    await expect(publisher.publish(pipeline)).rejects.toThrow(
      'cannot atomically persist CCS config'
    );
  });

  it('serializes concurrent publication attempts instead of interleaving state', async () => {
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let call = 0;
    const deps = dependencies(events);
    deps.createClient = () => ({
      putConfigYaml: async () => {
        call += 1;
        events.push(`put:${call}`);
        if (call === 1) await firstGate;
        return receipt();
      },
      getModelInventory: async () => activeInventory(),
    });
    const publisher = new ModelPipelinePublisher(deps);

    const first = publisher.publish(pipeline);
    const second = publisher.publish(pipeline);
    await Promise.resolve();
    await Promise.resolve();
    expect(events.filter((event) => event === 'persist')).toHaveLength(0);
    releaseFirst!();
    await Promise.all([first, second]);
    expect(events.filter((event) => event === 'persist')).toHaveLength(2);
  });

  it('rejects stale generations and same-generation digest collisions', () => {
    const config = configuredPipeline();
    const stale = structuredClone(pipeline);
    stale.snapshot.generation = 41;
    expect(() => replaceModelPipeline(config, stale)).toThrow(ModelPipelineGenerationConflictError);

    const collision = structuredClone(pipeline);
    collision.snapshot.snapshot_digest = `sha256:${'f'.repeat(64)}`;
    expect(() => replaceModelPipeline(config, collision)).toThrow(
      'generation 42 already exists with a different snapshot_digest'
    );
  });
});
