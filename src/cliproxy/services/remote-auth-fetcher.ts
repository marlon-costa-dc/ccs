/**
 * Remote Auth Fetcher
 * Fetches and transforms auth data from remote CLIProxyAPI.
 */

import * as https from 'https';
import {
  getProxyTarget,
  buildProxyUrl,
  buildManagementHeaders,
  ProxyTarget,
} from '../proxy/proxy-target-resolver';
import { getProviderDisplayName, mapExternalProviderName } from '../provider-capabilities';
import type { CLIProxyProvider } from '../types';
import {
  AuthError,
  CCSError,
  ConfigError,
  NetworkError,
  ProviderError,
} from '../../errors/error-types';

async function fetchRemoteAuthResponse(
  url: string,
  headers: Record<string, string>,
  target: ProxyTarget
): Promise<Response> {
  if (target.protocol !== 'https' || !target.allowSelfSigned) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), target.managementTimeoutMs);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return new Promise<Response>((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false });
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = setTimeout(() => {
      const timeoutError = new Error('Request timeout');
      req.destroy(timeoutError);
      settle(() => reject(timeoutError));
    }, target.managementTimeoutMs);

    const req = https.request(
      url,
      {
        method: 'GET',
        headers,
        agent,
        timeout: target.managementTimeoutMs,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          settle(() =>
            resolve(
              new Response(body, {
                status: res.statusCode || 500,
                statusText: res.statusMessage ?? '',
                headers:
                  typeof res.headers['content-type'] === 'string'
                    ? { 'Content-Type': res.headers['content-type'] }
                    : undefined,
              })
            )
          );
        });
      }
    );

    req.on('error', (error) => {
      settle(() => reject(error));
    });

    req.on('timeout', () => {
      const timeoutError = new Error('Request timeout');
      req.destroy(timeoutError);
      settle(() => reject(timeoutError));
    });

    req.end();
  });
}

/** Remote auth file from CLIProxyAPI /v0/management/auth-files */
interface RemoteAuthFile {
  id: string;
  name: string;
  provider: CLIProxyProvider;
  email?: string;
  status: 'unknown' | 'active' | 'pending' | 'refreshing' | 'error' | 'disabled';
}

const REMOTE_AUTH_STATUSES = new Set<RemoteAuthFile['status']>([
  'unknown',
  'active',
  'pending',
  'refreshing',
  'error',
  'disabled',
]);

function readRequiredString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProviderError(`${path}.${key} must be a non-empty string`, 'cliproxy');
  }
  return value;
}

function parseRemoteAuthFile(value: unknown, index: number): RemoteAuthFile {
  const path = `CLIProxy auth-files response.files[${index}]`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProviderError(`${path} must be an object`, 'cliproxy');
  }
  const record = value as Record<string, unknown>;
  const providerName = readRequiredString(record, 'provider', path);
  const provider = mapExternalProviderName(providerName);
  if (!provider) {
    throw new ProviderError(`${path}.provider is unsupported: ${providerName}`, 'cliproxy');
  }
  const status = readRequiredString(record, 'status', path);
  if (!REMOTE_AUTH_STATUSES.has(status as RemoteAuthFile['status'])) {
    throw new ProviderError(`${path}.status is unsupported: ${status}`, 'cliproxy');
  }
  if (record.email !== undefined && typeof record.email !== 'string') {
    throw new ProviderError(`${path}.email must be a string when present`, 'cliproxy');
  }
  return {
    id: readRequiredString(record, 'id', path),
    name: readRequiredString(record, 'name', path),
    provider,
    ...(record.email !== undefined && { email: record.email as string }),
    status: status as RemoteAuthFile['status'],
  };
}

function parseRemoteAuthFilesResponse(value: unknown): RemoteAuthFile[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProviderError('CLIProxy auth-files response must be an object', 'cliproxy');
  }
  const files = (value as Record<string, unknown>).files;
  if (!Array.isArray(files)) {
    throw new ProviderError('CLIProxy auth-files response.files must be an array', 'cliproxy');
  }
  return files.map(parseRemoteAuthFile);
}

/** Account info for UI display */
export interface RemoteAccountInfo {
  id: string;
  email: string;
  provider: CLIProxyProvider;
  isDefault: boolean;
  status: RemoteAuthFile['status'];
}

/** Auth status for a provider (UI format) */
export interface RemoteAuthStatus {
  provider: string;
  displayName: string;
  authenticated: boolean;
  tokenFiles: number;
  accounts: RemoteAccountInfo[];
  defaultAccount: string | null;
  source: 'remote';
}

/**
 * Fetch auth status from remote CLIProxyAPI
 * @throws A typed CCS error if the target, authentication, transport, or response is invalid.
 */
export async function fetchRemoteAuthStatus(target?: ProxyTarget): Promise<RemoteAuthStatus[]> {
  const proxyTarget = target ?? getProxyTarget();

  if (!proxyTarget.isRemote) {
    throw new ConfigError('fetchRemoteAuthStatus requires remote CLIProxy mode');
  }

  const url = buildProxyUrl(proxyTarget, '/v0/management/auth-files');
  const headers = buildManagementHeaders(proxyTarget);

  try {
    const response = await fetchRemoteAuthResponse(url, headers, proxyTarget);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AuthError('CLIProxy management authentication failed', 'cliproxy');
      }
      throw new NetworkError(
        `CLIProxy management request returned ${response.status}: ${response.statusText}`,
        url,
        response.status
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      throw new ProviderError('CLIProxy auth-files response is not valid JSON', 'cliproxy', error);
    }
    return transformRemoteAuthFiles(parseRemoteAuthFilesResponse(data));
  } catch (error) {
    if (error instanceof CCSError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new NetworkError('CLIProxy management request timed out', url);
    }
    if (error instanceof Error && error.message === 'Request timeout') {
      throw new NetworkError('CLIProxy management request timed out', url);
    }
    throw new NetworkError('CLIProxy management request failed', url);
  }
}

/**
 * Transform CLIProxyAPI auth files to CCS AuthStatus format
 * @param files Array of auth files from remote API
 */
function transformRemoteAuthFiles(files: RemoteAuthFile[]): RemoteAuthStatus[] {
  const byProvider = new Map<CLIProxyProvider, RemoteAuthFile[]>();

  for (const file of files) {
    const existing = byProvider.get(file.provider);
    if (existing) {
      existing.push(file);
    } else {
      byProvider.set(file.provider, [file]);
    }
  }

  const result: RemoteAuthStatus[] = [];

  for (const [provider, providerFiles] of byProvider) {
    const activeFiles = providerFiles.filter((f) => f.status === 'active');
    const accounts: RemoteAccountInfo[] = providerFiles.map((f, idx) => ({
      id: f.id,
      email: f.email || f.name || 'Unknown',
      // Keep provider on each account so UI account rendering can infer capabilities safely.
      provider,
      isDefault: idx === 0,
      status: f.status,
    }));

    result.push({
      provider,
      displayName: getProviderDisplayName(provider),
      authenticated: activeFiles.length > 0,
      tokenFiles: providerFiles.length,
      accounts,
      defaultAccount: accounts.find((a) => a.isDefault)?.id || null,
      source: 'remote',
    });
  }

  return result;
}
