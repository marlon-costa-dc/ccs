import { afterEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';
import * as http from 'node:http';
import {
  modelPipelineConfigFixture,
  modelPipelineRequestFixture,
} from '../../../config/schemas/__tests__/fixtures/model-pipeline-v2-fixture';
import { parseModelPipelineConfig } from '../../../config/schemas/model-pipeline';
import { ConfigError } from '../../../errors/error-types';
import {
  ModelPipelineGenerationConflictError,
  ModelPipelineSnapshotNotFoundError,
} from '../../../cliproxy/services/model-pipeline-publisher';
import {
  createModelPipelineRouter,
  type ModelPipelineRouteDependencies,
} from '../model-pipeline-routes';

const pipeline = parseModelPipelineConfig(modelPipelineConfigFixture());
const servers: http.Server[] = [];

async function request(
  dependencies: ModelPipelineRouteDependencies,
  method: 'GET' | 'PUT',
  body?: unknown
): Promise<Response> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/config', createModelPipelineRouter(dependencies));
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new ConfigError('test server has no TCP address');
  }
  return fetch(`http://127.0.0.1:${address.port}/api/config/model-pipeline`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function dependencies(): ModelPipelineRouteDependencies {
  return {
    loadPipeline: async () => pipeline,
    publishPipeline: async () => pipeline.receipt,
  };
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          )
      )
  );
});

describe('model pipeline config routes', () => {
  it('publishes an exact section envelope and returns verified active digests', async () => {
    const deps = dependencies();
    const publish = mock(deps.publishPipeline);
    deps.publishPipeline = publish;

    const publication = modelPipelineRequestFixture();
    const response = await request(deps, 'PUT', publication);
    const result = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      schema_version: 2,
      ok: true,
      active: {
        generation: 1,
        snapshot_digest: pipeline.snapshot.snapshot_digest,
        projection_digest: pipeline.receipt.active.projection_digest,
      },
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[0]).toEqual(publication);
    expect(publish.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
  });

  it('rejects schema drift before publication', async () => {
    const deps = dependencies();
    const publish = mock(deps.publishPipeline);
    deps.publishPipeline = publish;

    const response = await request(deps, 'PUT', { schema_version: 1, snapshot: {} });
    const result = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(result.error).toContain('model_pipeline_publication.schema_version');
    expect(publish).not.toHaveBeenCalled();
  });

  it('reports generation conflicts explicitly', async () => {
    const deps = dependencies();
    deps.publishPipeline = async () => {
      throw new ModelPipelineGenerationConflictError('stale generation');
    };

    const response = await request(deps, 'PUT', modelPipelineRequestFixture());
    const result = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(result).toEqual({ error: 'stale generation', stage: 'compare-and-swap' });
  });

  it('surfaces publish, reload or inventory failure as a bad gateway', async () => {
    const deps = dependencies();
    deps.publishPipeline = async () => {
      throw new ConfigError('CLIProxy active snapshot_digest mismatch');
    };

    const response = await request(deps, 'PUT', modelPipelineRequestFixture());
    const result = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(result).toEqual({
      error: 'CLIProxy active snapshot_digest mismatch',
      stage: 'cliproxy-verification',
    });
  });

  it('serves the same immutable snapshot used by the dashboard', async () => {
    const deps = dependencies();
    const load = mock(deps.loadPipeline);
    deps.loadPipeline = load;
    const response = await request(deps, 'GET');
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual(pipeline);
    expect(load.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });

  it('returns bad gateway instead of serving a snapshot when active inventory drifts', async () => {
    const deps = dependencies();
    deps.loadPipeline = async () => {
      throw new ConfigError('CLIProxy active projection_digest mismatch');
    };

    const response = await request(deps, 'GET');

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'CLIProxy active projection_digest mismatch',
      stage: 'cliproxy-verification',
    });
  });

  it('returns not found only when no persisted snapshot exists', async () => {
    const deps = dependencies();
    deps.loadPipeline = async () => {
      throw new ModelPipelineSnapshotNotFoundError();
    };

    const response = await request(deps, 'GET');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error_code: 'model_pipeline_snapshot_not_found',
      stage: 'load',
    });
  });

  it('does not misclassify an unrelated error with the bootstrap message as absence', async () => {
    const deps = dependencies();
    deps.loadPipeline = async () => {
      throw new ConfigError('Model pipeline snapshot not found');
    };

    const response = await request(deps, 'GET');

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Model pipeline snapshot not found',
      stage: 'cliproxy-verification',
    });
  });
});
