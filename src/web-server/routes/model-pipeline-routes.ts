import { Router, type Request, type Response } from 'express';
import { UserAbortError } from '../../errors/error-types';
import {
  parseModelPipelinePublicationRequest,
  type ModelPipelineConfig,
  type ModelPipelinePublicationRequest,
} from '../../config/schemas/model-pipeline';
import {
  ModelPipelineGenerationConflictError,
  ModelPipelineSnapshotNotFoundError,
  publishModelPipeline,
  readVerifiedModelPipeline,
  type VerifiedModelPipelinePublication,
} from '../../cliproxy/services/model-pipeline-publisher';

export interface ModelPipelineRouteDependencies {
  loadPipeline(signal?: AbortSignal): Promise<ModelPipelineConfig>;
  publishPipeline(value: unknown, signal?: AbortSignal): Promise<VerifiedModelPipelinePublication>;
}

const defaultDependencies: ModelPipelineRouteDependencies = {
  loadPipeline: readVerifiedModelPipeline,
  publishPipeline: publishModelPipeline,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown model pipeline publication error';
}

function requestCancellation(
  req: Request,
  res: Response
): {
  readonly signal: AbortSignal;
  dispose(): void;
} {
  const controller = new AbortController();
  const cancel = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(new UserAbortError('Model pipeline HTTP request cancelled'));
    }
  };
  const close = (): void => {
    if (!res.writableEnded) cancel();
  };
  req.once('aborted', cancel);
  res.once('close', close);
  return {
    signal: controller.signal,
    dispose() {
      req.off('aborted', cancel);
      res.off('close', close);
    },
  };
}

export function createModelPipelineRouter(
  dependencies: ModelPipelineRouteDependencies = defaultDependencies
): Router {
  const router = Router();

  router.get('/model-pipeline', async (req: Request, res: Response): Promise<void> => {
    const cancellation = requestCancellation(req, res);
    try {
      const pipeline = await dependencies.loadPipeline(cancellation.signal);
      res.json(pipeline);
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof ModelPipelineSnapshotNotFoundError) {
        res.status(404).json({
          ok: false,
          error_code: 'model_pipeline_snapshot_not_found',
          stage: 'load',
        });
        return;
      }
      const message = errorMessage(error);
      res.status(502).json({ error: message, stage: 'cliproxy-verification' });
    } finally {
      cancellation.dispose();
    }
  });

  router.put('/model-pipeline', async (req: Request, res: Response): Promise<void> => {
    const cancellation = requestCancellation(req, res);
    let publication: ModelPipelinePublicationRequest;
    try {
      publication = parseModelPipelinePublicationRequest(req.body);
    } catch (error) {
      res.status(400).json({ error: errorMessage(error), stage: 'validation' });
      cancellation.dispose();
      return;
    }

    try {
      const receipt = await dependencies.publishPipeline(publication, cancellation.signal);
      res.json(receipt);
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof ModelPipelineGenerationConflictError) {
        res.status(409).json({ error: errorMessage(error), stage: 'compare-and-swap' });
        return;
      }
      res.status(502).json({ error: errorMessage(error), stage: 'cliproxy-verification' });
    } finally {
      cancellation.dispose();
    }
  });

  return router;
}
