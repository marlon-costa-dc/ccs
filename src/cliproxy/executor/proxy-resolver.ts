/**
 * Proxy Resolver — Concern D
 *
 * Handles proxy configuration resolution, remote proxy reachability check,
 * local-backend selection, and CLIProxy binary acquisition.
 *
 * Extracted from executor/index.ts to isolate the proxy-resolution concern.
 * All log messages, error messages, and exit semantics are byte-identical to
 * the original implementation.
 */

import { ProgressIndicator } from '../../utils/progress-indicator';
import { ok, fail } from '../../utils/ui';
import {
  ensureCLIProxyBinary,
  getConfiguredBackend,
  getPlusBackendUnavailableMessage,
} from '../binary-manager';
import { checkRemoteProxy } from '../services/remote-proxy-client';
import { CLIProxyProvider, CLIProxyBackend, PLUS_ONLY_PROVIDERS, ExecutorConfig } from '../types';
import { resolveProxyTarget } from '../proxy/proxy-target-resolver';
import type { ResolvedProxyConfig } from '../types';
import type { UnifiedConfig } from '../../config/schemas/unified-config';
import { isNetworkError, handleNetworkError } from './failure-handler';

export interface ResolvedExecutorProxyConfig {
  /** Proxy config resolved once from the validated CCS configuration snapshot. */
  proxyConfig: ResolvedProxyConfig;
  /** Original args; proxy connection overrides are not a supported CLI surface. */
  argsWithoutProxy: string[];
  /** Mutated executor config (port resolved and validated) */
  cfg: ExecutorConfig;
}

/** Result returned from resolveExecutorProxy */
export interface ResolvedProxy extends ResolvedExecutorProxyConfig {
  /** Whether to use the remote proxy (vs spawning a local one) */
  useRemoteProxy: boolean;
  /** Which local backend binary to use ('original' | 'plus') */
  localBackend: CLIProxyBackend;
  /** Absolute path to CLIProxy binary; undefined when useRemoteProxy=true */
  binaryPath: string | undefined;
}

/** Dependencies injected by the orchestrator */
export interface ResolveExecutorProxyContext {
  unifiedConfig: UnifiedConfig;
  allProviders: CLIProxyProvider[];
  verbose: boolean;
  cfg: ExecutorConfig;
  log: (msg: string) => void;
}

/**
 * Resolves side-effect-free proxy configuration from the loaded CCS snapshot.
 *
 * Mutates `context.cfg.port` in-place (same as original orchestrator behaviour).
 */
export function resolveExecutorProxyConfig(
  args: string[],
  context: ResolveExecutorProxyContext
): ResolvedExecutorProxyConfig {
  const { unifiedConfig, cfg, log } = context;

  const target = resolveProxyTarget(unifiedConfig.cliproxy_server);
  const proxyConfig: ResolvedProxyConfig = {
    mode: target.isRemote ? 'remote' : 'local',
    host: target.host,
    port: target.port,
    protocol: target.protocol,
    authToken: target.authToken,
    managementKey: target.managementKey,
    timeout: target.managementTimeoutMs,
    allowSelfSigned: target.allowSelfSigned,
  };
  const argsWithoutProxy = args;

  cfg.port = target.port;

  log(`Proxy mode: ${proxyConfig.mode}`);
  if (proxyConfig.mode === 'remote') {
    log(`Remote host: ${proxyConfig.host}:${proxyConfig.port} (${proxyConfig.protocol})`);
  }

  return { proxyConfig, argsWithoutProxy, cfg };
}

/**
 * Resolves proxy configuration, checks remote reachability, selects the local
 * backend, and ensures the CLIProxy binary is present when running locally.
 */
export async function resolveExecutorProxy(
  resolvedConfig: ResolvedExecutorProxyConfig,
  context: ResolveExecutorProxyContext
): Promise<ResolvedProxy> {
  const { allProviders, verbose: _verbose } = context;
  const { proxyConfig, argsWithoutProxy, cfg } = resolvedConfig;

  // Check remote proxy reachability
  let useRemoteProxy = false;
  let localBackend: CLIProxyBackend = 'original';

  if (proxyConfig.mode === 'remote') {
    const status = await checkRemoteProxy({
      host: proxyConfig.host,
      port: proxyConfig.port,
      protocol: proxyConfig.protocol,
      authToken: proxyConfig.authToken,
      timeout: proxyConfig.timeout,
      allowSelfSigned: proxyConfig.allowSelfSigned,
    });

    if (status.reachable) {
      useRemoteProxy = true;
      console.log(
        ok(
          `Connected to remote proxy at ${proxyConfig.host}:${proxyConfig.port} (${status.latencyMs}ms)`
        )
      );
    } else {
      throw new Error(`Remote proxy unreachable: ${status.error ?? 'unknown error'}`);
    }
  }

  // Local backend selection (only when not using remote proxy)
  if (!useRemoteProxy) {
    localBackend = getConfiguredBackend({ notifyOnPlus: true });

    for (const p of allProviders) {
      if (localBackend === 'original' && PLUS_ONLY_PROVIDERS.includes(p as CLIProxyProvider)) {
        console.error('');
        console.error(fail(getPlusBackendUnavailableMessage(p)));
        console.error('');
        throw new Error(`Provider ${p} requires local CLIProxy Plus backend`);
      }
    }
  }

  // Binary acquisition — skipped when using remote proxy
  let binaryPath: string | undefined;

  if (!useRemoteProxy) {
    const spinner = new ProgressIndicator('Preparing CLIProxy');
    spinner.start();

    try {
      binaryPath = await ensureCLIProxyBinary(_verbose, { skipAutoUpdate: true });
      spinner.succeed('CLIProxy binary ready');
    } catch (error) {
      spinner.fail('Failed to prepare CLIProxy');
      const err = error as Error;

      if (isNetworkError(err)) {
        handleNetworkError(err);
      }

      throw error;
    }
  }

  return {
    proxyConfig,
    useRemoteProxy,
    localBackend,
    binaryPath,
    argsWithoutProxy,
    cfg,
  };
}
