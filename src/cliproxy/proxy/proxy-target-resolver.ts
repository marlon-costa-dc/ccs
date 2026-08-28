/**
 * Proxy Target Resolver
 *
 * Determines whether CLIProxyAPI requests should go to local or remote
 * based on unified config. Used by stats-fetcher, auth-routes, and UI.
 */

import type { CliproxyServerConfig } from '../../config/unified-config-types';
import { getEffectiveManagementSecret } from '../auth/auth-token-manager';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import { ConfigError } from '../../errors/error-types';

/** Resolved proxy target for making requests */
export interface ProxyTarget {
  /** Target hostname or IP */
  host: string;
  /** Target port */
  port: number;
  /** Protocol (http/https) */
  protocol: 'http' | 'https';
  /** Optional auth token for API endpoints - only send header if defined and non-empty */
  authToken?: string;
  /** Optional management key for management API endpoints (/v0/management/*) */
  managementKey?: string;
  /** Whether HTTPS requests should allow self-signed certificates */
  allowSelfSigned: boolean;
  /** CCS-owned deadline for management calls when this target came from CCS config. */
  managementTimeoutMs: number;
  /** True if targeting remote server, false if local */
  isRemote: boolean;
}

/**
 * Load cliproxy_server configuration from unified config.
 * Returns undefined if not configured.
 */
function loadCliproxyServerConfig(): CliproxyServerConfig | undefined {
  const config = loadOrCreateUnifiedConfig();
  return config.cliproxy_server;
}

/**
 * Get the current CLIProxyAPI target based on unified config.
 * Returns remote server config if enabled, otherwise localhost.
 */
export function getProxyTarget(): ProxyTarget {
  return resolveProxyTarget(loadCliproxyServerConfig());
}

/** Resolve a target from one already-loaded CCS configuration snapshot. */
export function resolveProxyTarget(config: CliproxyServerConfig | undefined): ProxyTarget {
  if (!config) {
    throw new ConfigError('cliproxy_server is required');
  }
  const managementTimeoutMs = config.management_timeout_ms;
  if (
    typeof managementTimeoutMs !== 'number' ||
    !Number.isInteger(managementTimeoutMs) ||
    managementTimeoutMs < 1
  ) {
    throw new ConfigError('cliproxy_server.management_timeout_ms must be a positive whole number');
  }

  if (config.remote.enabled) {
    if (!config.remote.host.trim()) {
      throw new ConfigError('cliproxy_server.remote.host is required when remote mode is enabled');
    }
    if (typeof config.remote.allow_self_signed !== 'boolean') {
      throw new ConfigError(
        'cliproxy_server.remote.allow_self_signed is required for a remote CLIProxy target'
      );
    }
    if (config.remote.protocol !== 'http' && config.remote.protocol !== 'https') {
      throw new ConfigError('cliproxy_server.remote.protocol must be http or https');
    }
    const port = config.remote.port;
    if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ConfigError(
        'cliproxy_server.remote.port must be a whole number between 1 and 65535'
      );
    }

    return {
      host: config.remote.host,
      port,
      protocol: config.remote.protocol,
      authToken: config.remote.auth_token || undefined, // Empty string -> undefined
      managementKey: config.remote.management_key || undefined, // Empty string -> undefined
      allowSelfSigned: config.remote.allow_self_signed,
      managementTimeoutMs,
      isRemote: true,
    };
  }

  const localPort = config.local.port;
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
    throw new ConfigError('cliproxy_server.local.port must be a whole number between 1 and 65535');
  }

  return {
    host: '127.0.0.1',
    port: localPort,
    protocol: 'http',
    allowSelfSigned: false,
    managementTimeoutMs,
    isRemote: false,
  };
}

/**
 * Build URL for proxy endpoint
 * @param target Resolved proxy target
 * @param path Endpoint path (e.g., '/v0/management/usage')
 */
export function buildProxyUrl(target: ProxyTarget, path: string): string {
  // Normalize path to ensure leading slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${target.protocol}://${target.host}:${target.port}${normalizedPath}`;
}

/**
 * Build request headers for proxy requests
 * Handles optional auth token - only adds Authorization header if token is set.
 *
 * @param target Resolved proxy target
 * @param additionalHeaders Extra headers to merge
 */
export function buildProxyHeaders(
  target: ProxyTarget,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...additionalHeaders,
  };

  // Only add auth header if token is configured
  if (target.authToken) {
    headers['Authorization'] = `Bearer ${target.authToken}`;
  }

  return headers;
}

/**
 * Build request headers for management API endpoints (/v0/management/*).
 * For remote targets: requires the configured management_key.
 * For local targets: uses the effective management secret from CCS config.
 *
 * @param target Resolved proxy target
 * @param additionalHeaders Extra headers to merge
 */
export function buildManagementHeaders(
  target: ProxyTarget,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...additionalHeaders,
  };

  const authKey = target.isRemote ? target.managementKey : getEffectiveManagementSecret();
  if (!authKey) {
    throw new ConfigError(
      target.isRemote
        ? 'cliproxy_server.remote.management_key is required'
        : 'cliproxy.auth.management_secret is required'
    );
  }
  headers['Authorization'] = `Bearer ${authKey}`;

  return headers;
}
