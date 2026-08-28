/**
 * Management API Client for CLIProxyAPI
 *
 * HTTP client for CLIProxy Management API endpoints.
 * Handles authentication, error mapping, and provides typed methods for CRUD operations.
 */

import * as https from 'https';
import type { Socket } from 'node:net';
import type {
  ManagementClientConfig,
  ManagementHealthStatus,
  ManagementApiErrorCode,
  ClaudeKey,
  ClaudeKeyPatch,
  RemoteModelInfo,
  GetModelDefinitionsResponse,
  CLIProxyActivationReceipt,
} from './management-api-types';
import { ConfigError, ProxyError, UserAbortError } from '../../errors/error-types';
import {
  parseModelPipelineInventory,
  type ModelPipelineInventory,
} from '../../config/schemas/model-pipeline';

const CONFIG_YAML_PATH = '/v0/management/config.yaml';
const MODEL_INVENTORY_PATH = '/v0/management/model-inventory';

interface EncodedRequestBody {
  readonly contentType: 'application/json' | 'application/yaml';
  readonly content: string;
}

type ResponseFormat = 'json' | 'text';

class ManagementRequestError extends ProxyError {
  readonly errorCode: ManagementApiErrorCode;
  readonly statusCode?: number;

  constructor(message: string, errorCode: ManagementApiErrorCode, statusCode?: number) {
    super(message);
    this.name = 'ManagementRequestError';
    this.errorCode = errorCode;
    this.statusCode = statusCode;
  }
}

function jsonBody(value: unknown): EncodedRequestBody {
  return { contentType: 'application/json', content: JSON.stringify(value) };
}

function yamlBody(value: string): EncodedRequestBody {
  return { contentType: 'application/yaml', content: value };
}

function decodeResponseBody<T>(content: string, format: ResponseFormat): T | undefined {
  if (!content) return undefined;
  if (format === 'text') return content as T;
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new ConfigError(
      `CLIProxy management response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ConfigError(`${label} must be a positive whole number`);
  }
  return value;
}

function readSha256Digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^sha256:[a-f\d]{64}$/.test(value)) {
    throw new ConfigError(`${label} must be a lowercase sha256 digest`);
  }
  return value;
}

function exactResponseKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new ConfigError(`${path}.${key} is not part of the contract`);
  }
}

function parseActiveIdentity(
  value: unknown,
  path: string
): NonNullable<CLIProxyActivationReceipt['previous_active']> {
  const identity = readRecord(value, path);
  exactResponseKeys(
    identity,
    ['generation', 'snapshot_digest', 'projection_digest', 'config_digest'],
    path
  );
  return {
    generation: readPositiveInteger(identity.generation, `${path}.generation`),
    snapshot_digest: readSha256Digest(identity.snapshot_digest, `${path}.snapshot_digest`),
    projection_digest: readSha256Digest(identity.projection_digest, `${path}.projection_digest`),
    config_digest: readSha256Digest(identity.config_digest, `${path}.config_digest`),
  };
}

function readTimestamp(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new ConfigError(`${path} must be a valid UTC RFC3339 timestamp`);
  }
  return value;
}

export function parseCLIProxyActivationReceipt(value: unknown): CLIProxyActivationReceipt {
  const receipt = readRecord(value, 'config publication receipt');
  exactResponseKeys(
    receipt,
    ['previous_active', 'active', 'routing_schema', 'binary_provenance', 'loaded_at'],
    'config publication receipt'
  );
  const routingSchema = readRecord(receipt.routing_schema, 'receipt.routing_schema');
  exactResponseKeys(routingSchema, ['version', 'digest'], 'receipt.routing_schema');
  if (routingSchema.version !== 2) {
    throw new ConfigError('receipt.routing_schema.version must equal 2');
  }
  const provenance = readRecord(receipt.binary_provenance, 'receipt.binary_provenance');
  exactResponseKeys(provenance, ['version', 'commit', 'built_at'], 'receipt.binary_provenance');
  const version = provenance.version;
  const commit = provenance.commit;
  if (typeof version !== 'string' || version.length === 0) {
    throw new ConfigError('receipt.binary_provenance.version must be a non-empty string');
  }
  if (typeof commit !== 'string' || commit.length === 0) {
    throw new ConfigError('receipt.binary_provenance.commit must be a non-empty string');
  }
  return {
    previous_active:
      receipt.previous_active === null
        ? null
        : parseActiveIdentity(receipt.previous_active, 'receipt.previous_active'),
    active: parseActiveIdentity(receipt.active, 'receipt.active'),
    routing_schema: {
      version: 2,
      digest: readSha256Digest(routingSchema.digest, 'receipt.routing_schema.digest'),
    },
    binary_provenance: {
      version,
      commit,
      built_at: readTimestamp(provenance.built_at, 'receipt.binary_provenance.built_at'),
    },
    loaded_at: readTimestamp(receipt.loaded_at, 'receipt.loaded_at'),
  };
}

export function formatActiveIdentityEtag(
  identity: NonNullable<CLIProxyActivationReceipt['previous_active']>
): string {
  const canonical = JSON.stringify({
    config_digest: identity.config_digest,
    generation: identity.generation,
    projection_digest: identity.projection_digest,
    snapshot_digest: identity.snapshot_digest,
  });
  return `"aihub-v2.${Buffer.from(canonical, 'utf8').toString('base64url')}"`;
}

function readPort(port: number | undefined): number {
  if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError('CLIProxy management port must be a whole number between 1 and 65535');
  }
  return port;
}

/**
 * Build URL for Management API endpoint.
 */
function buildUrl(config: ManagementClientConfig, path: string): string {
  const port = readPort(config.port);
  // Only omit port if it matches standard web ports
  if (
    (config.protocol === 'https' && port === 443) ||
    (config.protocol === 'http' && port === 80)
  ) {
    return `${config.protocol}://${config.host}${path}`;
  }
  return `${config.protocol}://${config.host}:${port}${path}`;
}

/**
 * Map error to ManagementApiErrorCode.
 */
function mapErrorToCode(error: Error, statusCode?: number): ManagementApiErrorCode {
  const message = error.message.toLowerCase();
  const rawCode = (error as NodeJS.ErrnoException).code;
  const code = typeof rawCode === 'string' ? rawCode.toLowerCase() : undefined;

  // DNS resolution failed
  if (code === 'enotfound' || code === 'eai_again' || message.includes('dns')) {
    return 'DNS_FAILED';
  }

  // Network unreachable
  if (code === 'enetunreach' || code === 'ehostunreach' || message.includes('unreachable')) {
    return 'NETWORK_UNREACHABLE';
  }

  // Connection refused
  if (code === 'econnrefused' || message.includes('connection refused')) {
    return 'CONNECTION_REFUSED';
  }

  // Timeout
  if (code === 'etimedout' || message.includes('timeout') || message.includes('aborted')) {
    return 'TIMEOUT';
  }

  // HTTP status codes
  if (statusCode === 401 || statusCode === 403) {
    return 'AUTH_FAILED';
  }
  if (statusCode === 404) {
    return 'NOT_FOUND';
  }
  if (statusCode === 400) {
    return 'BAD_REQUEST';
  }
  if (statusCode && statusCode >= 500) {
    return 'SERVER_ERROR';
  }

  return 'UNKNOWN';
}

/**
 * Get human-readable error message from error code.
 */
function getErrorMessage(errorCode: ManagementApiErrorCode, rawError?: string): string {
  switch (errorCode) {
    case 'CONNECTION_REFUSED':
      return 'Connection refused - is CLIProxy running?';
    case 'TIMEOUT':
      return 'Request timed out - server may be slow or unreachable';
    case 'AUTH_FAILED':
      return 'Authentication failed - check management key';
    case 'DNS_FAILED':
      return 'DNS lookup failed - check hostname';
    case 'NETWORK_UNREACHABLE':
      return 'Network unreachable - check if host is accessible';
    case 'NOT_FOUND':
      return 'Endpoint not found - check CLIProxy version';
    case 'BAD_REQUEST':
      return 'Invalid request - check payload format';
    case 'SERVER_ERROR':
      return 'Server error - check CLIProxy logs';
    default:
      return rawError || 'Request failed';
  }
}

/**
 * Management API Client for CLIProxyAPI.
 * Provides typed methods for CRUD operations on claude-api-key configuration.
 */
export class ManagementApiClient {
  private readonly config: ManagementClientConfig;
  private readonly timeout: number;

  constructor(config: ManagementClientConfig) {
    if (!config.host.trim()) {
      throw new ConfigError('CLIProxy management host is required');
    }
    if (config.protocol !== 'http' && config.protocol !== 'https') {
      throw new ConfigError('CLIProxy management protocol must be http or https');
    }
    readPort(config.port);
    if (!config.managementKey) {
      throw new ConfigError('CLIProxy management key is required');
    }
    if (typeof config.allowSelfSigned !== 'boolean') {
      throw new ConfigError('CLIProxy allowSelfSigned policy is required');
    }
    this.config = config;
    this.timeout = readPositiveInteger(config.timeout, 'CLIProxy management timeout');
  }

  /**
   * Build base URL for display purposes.
   */
  getBaseUrl(): string {
    return buildUrl(this.config, '');
  }

  /**
   * Check health of Management API.
   * Uses GET /v0/management/claude-api-key as health check.
   */
  async health(): Promise<ManagementHealthStatus> {
    const startTime = Date.now();
    try {
      const response = await this.request('GET', '/v0/management/claude-api-key');
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        version: response.headers?.['x-cpa-version'],
        commit: response.headers?.['x-cpa-commit'],
      };
    } catch (error) {
      const err = error as Error & { statusCode?: number; errorCode?: ManagementApiErrorCode };
      return {
        healthy: false,
        error: err.message,
        errorCode: err.errorCode ?? 'UNKNOWN',
      };
    }
  }

  /**
   * Get all claude-api-key entries from remote CLIProxy.
   */
  async getClaudeKeys(): Promise<ClaudeKey[]> {
    return this.getSection<ClaudeKey>('claude-api-key');
  }

  /**
   * Replace all claude-api-key entries on remote CLIProxy.
   * This is an atomic operation - all entries are replaced at once.
   */
  async putClaudeKeys(keys: ClaudeKey[]): Promise<void> {
    await this.putSection('claude-api-key', keys);
  }

  /**
   * Update a single claude-api-key entry by index or api-key match.
   */
  async patchClaudeKey(patch: ClaudeKeyPatch): Promise<void> {
    await this.request('PATCH', '/v0/management/claude-api-key', jsonBody(patch));
  }

  /**
   * Delete a claude-api-key entry by api-key value.
   */
  async deleteClaudeKey(apiKey: string): Promise<void> {
    const encodedKey = encodeURIComponent(apiKey);
    await this.request('DELETE', `/v0/management/claude-api-key?api-key=${encodedKey}`);
  }

  /**
   * Get model definitions for a channel from CLIProxyAPI.
   * GET /v0/management/model-definitions/:channel
   */
  async getModelDefinitions(channel: string): Promise<RemoteModelInfo[]> {
    const encodedChannel = encodeURIComponent(channel);
    const response = await this.request<GetModelDefinitionsResponse>(
      'GET',
      `/v0/management/model-definitions/${encodedChannel}`
    );
    const data = readRecord(response.data, 'model definitions response');
    if (!Array.isArray(data.models)) {
      throw new ConfigError('model definitions response.models must be an array');
    }
    return data.models as RemoteModelInfo[];
  }

  /**
   * Atomically replace CLIProxy's complete native config and return its active
   * model-routing digest receipt. CLIProxy owns validation, persistence, and
   * online reload for this endpoint.
   */
  async putConfigYaml(
    configYaml: string,
    expectedActive: CLIProxyActivationReceipt['previous_active'],
    signal?: AbortSignal
  ): Promise<CLIProxyActivationReceipt> {
    const preconditionHeaders: Readonly<Record<string, string>> = expectedActive
      ? { 'If-Match': formatActiveIdentityEtag(expectedActive) }
      : { 'If-None-Match': '*' };
    const response = await this.request<unknown>(
      'PUT',
      CONFIG_YAML_PATH,
      yamlBody(configYaml),
      signal,
      'json',
      preconditionHeaders
    );
    const receipt = parseCLIProxyActivationReceipt(response.data);
    const expectedEtag = formatActiveIdentityEtag(receipt.active);
    if (response.headers?.etag !== expectedEtag) {
      throw new ConfigError(
        `CLIProxy activation ETag mismatch: expected ${expectedEtag}, got ${response.headers?.etag ?? 'missing'}`
      );
    }
    return receipt;
  }

  /** Read the exact active native config without re-encoding or secret logging. */
  async getConfigYaml(signal?: AbortSignal): Promise<string> {
    const response = await this.request<string>('GET', CONFIG_YAML_PATH, undefined, signal, 'text');
    const contentType = response.headers?.['content-type'];
    if (!contentType?.toLowerCase().startsWith('application/yaml')) {
      throw new ConfigError(
        `CLIProxy config.yaml response must use application/yaml, got ${contentType ?? 'missing content-type'}`
      );
    }
    if (typeof response.data !== 'string' || !response.data.trim()) {
      throw new ConfigError('CLIProxy config.yaml response must not be empty');
    }
    return response.data;
  }

  /** Read the exact active CLIProxy inventory and reject schema drift. */
  async getModelInventory(signal?: AbortSignal): Promise<ModelPipelineInventory> {
    const response = await this.request<unknown>('GET', MODEL_INVENTORY_PATH, undefined, signal);
    return parseModelPipelineInventory(response.data);
  }

  /**
   * Get a management section from CLIProxyAPI.
   * Example sections: claude-api-key, gemini-api-key, codex-api-key.
   */
  async getSection<T>(section: string): Promise<T[]> {
    const response = await this.request<Record<string, T[]>>('GET', `/v0/management/${section}`);
    const data = readRecord(response.data, `${section} response`);
    const entries = data[section];
    if (!Array.isArray(entries)) {
      throw new ConfigError(`${section} response.${section} must be an array`);
    }
    return entries as T[];
  }

  /**
   * Replace an entire management section on CLIProxyAPI.
   */
  async putSection<T>(section: string, entries: T[]): Promise<void> {
    await this.request('PUT', `/v0/management/${section}`, jsonBody(entries));
  }

  /**
   * Make an HTTP request to the Management API.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: EncodedRequestBody,
    signal?: AbortSignal,
    responseFormat: ResponseFormat = 'json',
    additionalHeaders: Readonly<Record<string, string>> = {}
  ): Promise<{ data?: T; headers?: Record<string, string> }> {
    const url = buildUrl(this.config, path);

    const headers: Record<string, string> = {
      Accept: responseFormat === 'text' ? 'application/yaml' : 'application/json',
      Authorization: `Bearer ${this.config.managementKey}`,
    };

    if (body !== undefined) {
      headers['Content-Type'] = body.contentType;
    }
    Object.assign(headers, additionalHeaders);

    // Use native https for self-signed cert support
    if (this.config.protocol === 'https' && this.config.allowSelfSigned) {
      return this.requestWithHttps<T>(method, url, headers, body, signal, responseFormat);
    }

    return this.requestWithFetch<T>(method, url, headers, body, signal, responseFormat);
  }

  /**
   * Make request using native fetch API.
   */
  private async requestWithFetch<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: EncodedRequestBody,
    signal?: AbortSignal,
    responseFormat: ResponseFormat = 'json'
  ): Promise<{ data?: T; headers?: Record<string, string> }> {
    const controller = new AbortController();
    const cancel = (): void => {
      controller.abort(
        signal?.reason instanceof Error
          ? signal.reason
          : new UserAbortError('CLIProxy management request cancelled')
      );
    };
    if (signal?.aborted) cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    const timeoutError = new ManagementRequestError(
      'CLIProxy management request timed out',
      'TIMEOUT'
    );
    const timeoutId = setTimeout(() => controller.abort(timeoutError), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body?.content,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorCode = mapErrorToCode(new Error(response.statusText), response.status);
        throw new ManagementRequestError(
          `CLIProxy management request failed with HTTP ${response.status}: ${response.statusText}`,
          errorCode,
          response.status
        );
      }

      // Extract headers we care about
      const responseHeaders: Record<string, string> = {};
      const version = response.headers.get('x-cpa-version');
      const commit = response.headers.get('x-cpa-commit');
      const contentType = response.headers.get('content-type');
      const etag = response.headers.get('etag');
      if (version) responseHeaders['x-cpa-version'] = version;
      if (commit) responseHeaders['x-cpa-commit'] = commit;
      if (contentType) responseHeaders['content-type'] = contentType;
      if (etag) responseHeaders.etag = etag;

      const data = decodeResponseBody<T>(await response.text(), responseFormat);

      return { data, headers: responseHeaders };
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason instanceof Error) {
        throw controller.signal.reason;
      }
      const err = error as Error & { statusCode?: number; errorCode?: ManagementApiErrorCode };
      if (!err.errorCode) {
        err.errorCode = mapErrorToCode(err, err.statusCode);
        err.message = getErrorMessage(err.errorCode, err.message);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', cancel);
    }
  }

  /**
   * Make request using native https module for self-signed cert support.
   */
  private async requestWithHttps<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: EncodedRequestBody,
    signal?: AbortSignal,
    responseFormat: ResponseFormat = 'json'
  ): Promise<{ data?: T; headers?: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const agent = new https.Agent({ rejectUnauthorized: false });
      const bodyStr = body?.content;

      if (bodyStr) {
        headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
      }

      const req = https.request(
        url,
        {
          method,
          headers,
          agent,
          timeout: this.timeout,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              const errorCode = mapErrorToCode(new Error(res.statusMessage || ''), res.statusCode);
              reject(
                new ManagementRequestError(
                  `CLIProxy management request failed with HTTP ${res.statusCode}: ${res.statusMessage ?? ''}`,
                  errorCode,
                  res.statusCode
                )
              );
              return;
            }

            const responseHeaders: Record<string, string> = {};
            const version = res.headers['x-cpa-version'];
            const commit = res.headers['x-cpa-commit'];
            const contentType = res.headers['content-type'];
            const etag = res.headers.etag;
            if (typeof version === 'string') responseHeaders['x-cpa-version'] = version;
            if (typeof commit === 'string') responseHeaders['x-cpa-commit'] = commit;
            if (typeof contentType === 'string') responseHeaders['content-type'] = contentType;
            if (typeof etag === 'string') responseHeaders.etag = etag;

            let parsed: T | undefined;
            try {
              parsed = decodeResponseBody<T>(data, responseFormat);
            } catch (error) {
              reject(error);
              return;
            }

            resolve({ data: parsed, headers: responseHeaders });
          });
        }
      );

      const timeoutError = new ManagementRequestError(
        'CLIProxy management request timed out',
        'TIMEOUT'
      );
      let terminationReason: Error | undefined;
      const destroyOwnedSocket = (socket: Socket, reason: Error): void => {
        if (socket.destroyed) return;
        if (typeof socket.resetAndDestroy === 'function') {
          socket.resetAndDestroy();
          return;
        }
        socket.destroy(reason);
      };
      const terminate = (reason: Error): void => {
        terminationReason ??= reason;
        if (req.socket) destroyOwnedSocket(req.socket, terminationReason);
        req.destroy(terminationReason);
        agent.destroy();
        reject(terminationReason);
      };
      const cancel = (): void => {
        terminate(
          signal?.reason instanceof Error
            ? signal.reason
            : new UserAbortError('CLIProxy management request cancelled')
        );
      };
      const cleanup = (): void => {
        clearTimeout(reqTimeout);
        signal?.removeEventListener('abort', cancel);
        agent.destroy();
      };
      req.once('close', cleanup);
      req.once('socket', (socket) => {
        if (terminationReason) destroyOwnedSocket(socket, terminationReason);
      });

      req.on('error', (err) => {
        if (terminationReason) {
          reject(terminationReason);
          return;
        }
        const error = err as Error & { errorCode?: ManagementApiErrorCode };
        error.errorCode = mapErrorToCode(err);
        error.message = getErrorMessage(error.errorCode, err.message);
        reject(error);
      });

      req.on('timeout', () => {
        terminate(timeoutError);
      });

      const reqTimeout = setTimeout(() => terminate(timeoutError), this.timeout);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();

      if (bodyStr && !req.destroyed) {
        req.write(bodyStr);
      }
      if (!req.destroyed) req.end();
    });
  }
}

/**
 * Create a ManagementApiClient from CCS config.
 * Uses cliproxy_server.remote settings.
 */
export function createManagementClient(
  remoteConfig: {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    management_key: string;
    timeout: number;
  },
  allowSelfSigned: boolean
): ManagementApiClient {
  return new ManagementApiClient({
    host: remoteConfig.host,
    port: readPort(remoteConfig.port),
    protocol: remoteConfig.protocol,
    managementKey: remoteConfig.management_key,
    timeout: readPositiveInteger(remoteConfig.timeout, 'CLIProxy management timeout'),
    allowSelfSigned,
  });
}
