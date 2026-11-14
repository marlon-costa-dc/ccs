/**
 * Image Analysis Hook Environment Variables
 *
 * Provides environment variables for image analysis hook configuration.
 * Hook routes image/PDF files through CLIProxy for vision analysis.
 *
 * @module utils/hooks/image-analysis-hook-env
 */

import { resolveCliproxyBridgeProfile } from '../../api/services/cliproxy-profile-bridge';
import { getEffectiveApiKey } from '../../cliproxy/auth/auth-token-manager';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import {
  buildProxyUrl,
  getProxyTarget,
  type ProxyTarget,
} from '../../cliproxy/proxy/proxy-target-resolver';
import { getPromptsDir } from '../image-analysis/hook-installer';
import {
  resolveImageAnalysisStatus,
  type ImageAnalysisResolutionContext,
} from './image-analysis-backend-resolver';
import { getImageAnalysisConfig } from '../../config/config-loader-facade';

/**
 * Serialize provider_models map to env var format: provider:model,provider:model
 */
function serializeProviderModels(providerModels: Record<string, string>): string {
  return Object.entries(providerModels)
    .map(([provider, model]) => `${provider}:${model}`)
    .join(',');
}

export interface ImageAnalysisRuntimeOverrides {
  backendId?: string | null;
  model?: string | null;
  runtimePath?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  allowSelfSigned?: boolean | null;
}

export interface ImageAnalysisRuntimeConnection {
  baseUrl: string;
  apiKey: string;
  allowSelfSigned: boolean;
  proxyTarget: ProxyTarget;
}

export interface ResolveImageAnalysisRuntimeConnectionOptions {
  proxyTarget?: ProxyTarget;
  tunnelPort?: number | null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveImageAnalysisRuntimeConnection(
  options: ResolveImageAnalysisRuntimeConnectionOptions = {}
): ImageAnalysisRuntimeConnection {
  const proxyTarget = options.proxyTarget ?? getProxyTarget();
  const apiKey = proxyTarget.authToken?.trim() || getEffectiveApiKey();

  if (proxyTarget.isRemote && options.tunnelPort && options.tunnelPort > 0) {
    return {
      baseUrl: `http://127.0.0.1:${options.tunnelPort}`,
      apiKey,
      allowSelfSigned: false,
      proxyTarget: {
        host: '127.0.0.1',
        port: options.tunnelPort,
        protocol: 'http',
        isRemote: false,
      },
    };
  }

  return {
    baseUrl: stripTrailingSlash(buildProxyUrl(proxyTarget, '')),
    apiKey,
    allowSelfSigned: Boolean(
      proxyTarget.isRemote && proxyTarget.protocol === 'https' && proxyTarget.allowSelfSigned
    ),
    proxyTarget,
  };
}

/**
 * Get image analysis hook environment variables.
 * These env vars control the hook's behavior via Claude Code hook system.
 *
 * @param input - Current runtime context
 * @returns Environment variables for image analysis hook
 */
export function getImageAnalysisHookEnv(
  input?: string | ImageAnalysisResolutionContext
): Record<string, string> {
  const config = getImageAnalysisConfig();
  const context =
    typeof input === 'string'
      ? {
          profileName: input,
          cliproxyProvider: mapExternalProviderName(input) ?? undefined,
        }
      : input;
  const status = context
    ? resolveImageAnalysisStatus(context, config)
    : resolveImageAnalysisStatus({ profileName: '' }, config);
  const skipImageAnalysis = !status.supported;
  const runtimeApiKey =
    !skipImageAnalysis && typeof context === 'object' && context.cliproxyBridge
      ? resolveCliproxyBridgeProfile(context.cliproxyBridge.provider).apiKey
      : '';
  const runtimePath = skipImageAnalysis ? '' : status.runtimePath || '';
  const runtimeBaseUrl =
    skipImageAnalysis || typeof context !== 'object'
      ? ''
      : context.cliproxyBridge?.currentBaseUrl || '';

  return {
    CCS_IMAGE_ANALYSIS_ENABLED: config.enabled ? '1' : '0',
    CCS_IMAGE_ANALYSIS_TIMEOUT: String(Number(config.timeout) || 60),
    CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: serializeProviderModels(config.provider_models),
    CCS_CURRENT_PROVIDER: status.backendId || '',
    CCS_IMAGE_ANALYSIS_BACKEND_ID: status.backendId || '',
    CCS_IMAGE_ANALYSIS_MODEL: status.model || '',
    CCS_IMAGE_ANALYSIS_RUNTIME_PATH: runtimePath,
    CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL: runtimeBaseUrl,
    ...(runtimeApiKey ? { CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY: runtimeApiKey } : {}),
    CCS_IMAGE_ANALYSIS_PROMPTS_DIR: getPromptsDir(),
    CCS_IMAGE_ANALYSIS_SKIP: skipImageAnalysis ? '1' : '0',
  };
}

/**
 * Overlay execution-specific runtime values onto the baseline image-analysis env.
 * Launch paths use this to pin analysis to the exact provider route and auth
 * token selected for the current session rather than any stale saved values.
 */
export function applyImageAnalysisRuntimeOverrides(
  env: Record<string, string>,
  overrides: ImageAnalysisRuntimeOverrides
): Record<string, string> {
  const nextEnv = { ...env };

  const backendId = overrides.backendId?.trim();
  if (backendId) {
    nextEnv.CCS_CURRENT_PROVIDER = backendId;
    nextEnv.CCS_IMAGE_ANALYSIS_BACKEND_ID = backendId;
  }

  const model = overrides.model?.trim();
  if (model) {
    nextEnv.CCS_IMAGE_ANALYSIS_MODEL = model;
  }

  const runtimePath = overrides.runtimePath?.trim();
  if (runtimePath) {
    nextEnv.CCS_IMAGE_ANALYSIS_RUNTIME_PATH = runtimePath;
  }

  if (overrides.baseUrl !== undefined) {
    nextEnv.CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL = overrides.baseUrl?.trim() || '';
  }

  if (overrides.apiKey !== undefined) {
    const apiKey = overrides.apiKey?.trim();
    if (apiKey) {
      nextEnv.CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY = apiKey;
    } else {
      delete nextEnv.CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY;
    }
  }

  if (overrides.allowSelfSigned !== undefined) {
    nextEnv.CCS_IMAGE_ANALYSIS_RUNTIME_ALLOW_SELF_SIGNED = overrides.allowSelfSigned ? '1' : '0';
  }

  return nextEnv;
}
