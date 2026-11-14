/**
 * Remote Proxy Client for CLIProxyAPI
 *
 * HTTP client for health checks and connection testing against remote CLIProxyAPI instances.
 * Uses native fetch API with aggressive timeout for CLI responsiveness.
 */

import * as https from 'https';
import { getRemoteDefaultPort, validateRemotePort } from '../config/config-generator';

/** Error codes for remote proxy status */
export type RemoteProxyErrorCode =
  | 'CONNECTION_REFUSED'
  | 'TIMEOUT'
  | 'AUTH_FAILED'
  | 'DNS_FAILED'
  | 'NETWORK_UNREACHABLE'
  | 'UNKNOWN';

/** Status returned from remote proxy health check */
export interface RemoteProxyStatus {
  /** Whether the remote proxy is reachable */
  reachable: boolean;
  /** Latency in milliseconds (only set if reachable) */
  latencyMs?: number;
  /** Error message (only set if not reachable) */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: RemoteProxyErrorCode;
}

/** Configuration for remote proxy client */
export interface RemoteProxyClientConfig {
  /** Remote proxy host (IP or hostname) */
  host: string;
  /**
   * Remote proxy port.
   * Optional - defaults based on protocol:
   * - HTTPS: 443
   * - HTTP: 8317 (CLIProxyAPI default)
   */
  port?: number;
  /** Protocol to use (http or https) */
  protocol: 'http' | 'https';
  /** Optional auth token for Authorization header */
  authToken?: string;
  /** Request timeout in ms (default: 2000) */
  timeout?: number;
  /** Allow self-signed certificates (default: false) */
  allowSelfSigned?: boolean;
}

/** Default timeout for remote proxy requests (aggressive for CLI UX) */
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Get standard web port for protocol (for URL display omission)
 * These are the ports that browsers/HTTP clients use by default.
 * HTTP: 80, HTTPS: 443
 */
function getStandardWebPort(protocol: 'http' | 'https'): number {
  return protocol === 'https' ? 443 : 80;
}

/**
 * Get effective port for CLIProxyAPI connection.
 * Validates port and uses protocol-based default for invalid/undefined values.
 */
function getEffectivePort(port: number | undefined, protocol: 'http' | 'https'): number {
  const validatedPort = validateRemotePort(port);
  return validatedPort ?? getRemoteDefaultPort(protocol);
}

/**
 * Build URL for remote proxy
 * Only omits port from URL if it matches standard web ports (80/443),
 * otherwise always includes the port for clarity.
 */
function buildProxyUrl(
  host: string,
  port: number | undefined,
  protocol: 'http' | 'https',
  path: string
): string {
  const effectivePort = getEffectivePort(port, protocol);
  const standardWebPort = getStandardWebPort(protocol);

  // Only omit port from URL if it matches the standard web port for the protocol
  // e.g., HTTP on port 80 or HTTPS on port 443
  if (effectivePort === standardWebPort) {
    return `${protocol}://${host}${path}`;
  }
  return `${protocol}://${host}:${effectivePort}${path}`;
}

/**
 * Map error to RemoteProxyErrorCode
 *
 * Handles various error types including:
 * - NodeJS.ErrnoException (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, ENETUNREACH)
 * - Fetch errors (AbortError, TypeError, "fetch failed")
 * - HTTP status codes (401, 403)
 */
function mapErrorToCode(error: Error, statusCode?: number): RemoteProxyErrorCode {
  const message = error.message.toLowerCase();
  // Handle error.code safely - it may be string, number, or undefined
  const rawCode = (error as NodeJS.ErrnoException).code;
  const code = typeof rawCode === 'string' ? rawCode.toLowerCase() : undefined;

  // DNS resolution failed
  if (
    code === 'enotfound' ||
    code === 'eai_again' ||
    message.includes('getaddrinfo') ||
    message.includes('dns')
  ) {
    return 'DNS_FAILED';
  }

  // Network unreachable / host unreachable
  if (
    code === 'enetunreach' ||
    code === 'ehostunreach' ||
    code === 'enetdown' ||
    message.includes('network') ||
    message.includes('unreachable')
  ) {
    return 'NETWORK_UNREACHABLE';
  }

  // Connection refused
  if (code === 'econnrefused' || message.includes('connection refused')) {
    return 'CONNECTION_REFUSED';
  }

  // Timeout
  if (
    code === 'etimedout' ||
    code === 'timeout' ||
    message.includes('timeout') ||
    message.includes('aborted')
  ) {
    return 'TIMEOUT';
  }

  // Auth failed (401/403)
  if (statusCode === 401 || statusCode === 403) {
    return 'AUTH_FAILED';
  }

  // Generic "fetch failed" - try to extract cause
  if (message.includes('fetch failed') || message.includes('failed to fetch')) {
    // Check if there's a cause property (Node.js 18+)
    const cause = (error as Error & { cause?: Error }).cause;
    if (cause) {
      return mapErrorToCode(cause);
    }
    // Likely network/DNS issue if no specific cause
    return 'NETWORK_UNREACHABLE';
  }

  return 'UNKNOWN';
}

/**
 * Get human-readable error message from error code
 */
function getErrorMessage(errorCode: RemoteProxyErrorCode, rawError?: string): string {
  switch (errorCode) {
    case 'CONNECTION_REFUSED':
      return 'Connection refused - is the proxy running?';
    case 'TIMEOUT':
      return 'Connection timed out - server may be slow or unreachable';
    case 'AUTH_FAILED':
      return 'Authentication failed - check auth token';
    case 'DNS_FAILED':
      return 'DNS lookup failed - check hostname';
    case 'NETWORK_UNREACHABLE':
      return 'Network unreachable - check if host is on same network';
    default:
      return rawError || 'Connection failed';
  }
}

/**
 * Create a custom HTTPS agent for self-signed certificate support
 */
function createHttpsAgent(allowSelfSigned: boolean): https.Agent | undefined {
  if (!allowSelfSigned) return undefined;

  return new https.Agent({
    rejectUnauthorized: false,
  });
}

/**
 * Check health of remote CLIProxyAPI instance
 *
 * Uses root endpoint (/) for health check since CLIProxyAPI doesn't expose /health.
 * Root is cheap and avoids false negatives from slower model-list endpoints.
 *
 * @param config Remote proxy client configuration
 * @returns RemoteProxyStatus with reachability and latency
 */
export async function checkRemoteProxy(
  config: RemoteProxyClientConfig
): Promise<RemoteProxyStatus> {
  const { host, port, protocol, authToken, allowSelfSigned = false } = config;
  const timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;

  // Validate host is provided
  if (!host || host.trim() === '') {
    return {
      reachable: false,
      error: 'Host is required',
      errorCode: 'UNKNOWN',
    };
  }

  // Use root endpoint for liveness check - cheap and available across deployments
  const url = buildProxyUrl(host, port, protocol, '/');
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Build request options
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // For HTTPS with self-signed certs, we need to use native https module
    // Bun's fetch doesn't support custom agents
    let response: Response;

    if (protocol === 'https' && allowSelfSigned) {
      // Warn about security implications
      console.error('[!] Allowing self-signed certificate - not recommended for production');

      // Use native https module for self-signed cert support
      response = await new Promise<Response>((resolve, reject) => {
        const agent = createHttpsAgent(true);
        let settled = false;

        const settle = (callback: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(reqTimeout);
          callback();
        };

        const reqTimeout = setTimeout(() => {
          const timeoutError = new Error('Request timeout');
          req.destroy(timeoutError);
          settle(() => reject(timeoutError));
        }, timeout);

        const req = https.request(
          url,
          {
            method: 'GET',
            headers,
            agent,
            timeout,
          },
          (res) => {
            // Health check only needs response headers; don't wait for full body.
            // This avoids timeout false negatives when servers stream slower payloads.
            res.resume();
            settle(() =>
              resolve(
                new Response(null, {
                  status: res.statusCode || 500,
                  statusText: res.statusMessage ?? '',
                })
              )
            );
          }
        );

        req.on('error', (err) => {
          settle(() => reject(err));
        });

        req.on('timeout', () => {
          const timeoutError = new Error('Request timeout');
          req.destroy(timeoutError);
          settle(() => reject(timeoutError));
        });

        req.end();
      });
    } else {
      // Standard fetch for HTTP or HTTPS without self-signed
      response = await fetch(url, {
        signal: controller.signal,
        headers,
      });
    }

    const latencyMs = Date.now() - startTime;

    // Check for auth failure
    if (response.status === 401 || response.status === 403) {
      return {
        reachable: false,
        error: getErrorMessage('AUTH_FAILED'),
        errorCode: 'AUTH_FAILED',
      };
    }

    // 200 OK = healthy
    if (response.ok) {
      return {
        reachable: true,
        latencyMs,
      };
    }

    // Non-200 but connected
    return {
      reachable: false,
      error: `Unexpected status: ${response.status}`,
      errorCode: 'UNKNOWN',
    };
  } catch (error) {
    const err = error as Error;
    const errorCode = mapErrorToCode(err);

    return {
      reachable: false,
      error: getErrorMessage(errorCode, err.message),
      errorCode,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Alias for dashboard connection tests. */
export async function testConnection(config: RemoteProxyClientConfig): Promise<RemoteProxyStatus> {
  return checkRemoteProxy(config);
}
