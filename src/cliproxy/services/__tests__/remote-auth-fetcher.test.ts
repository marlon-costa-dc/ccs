import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { fetchRemoteAuthStatus } from '../../services/remote-auth-fetcher';
import type { ProxyTarget } from '../../proxy/proxy-target-resolver';
import { AuthError, ConfigError, NetworkError, ProviderError } from '../../../errors/error-types';

describe('remote-auth-fetcher', () => {
  let originalFetch: typeof fetch;

  const remoteTarget: ProxyTarget = {
    host: 'remote.example.com',
    port: 8317,
    protocol: 'https',
    authToken: 'token',
    managementKey: 'management-key',
    allowSelfSigned: false,
    managementTimeoutMs: 5_000,
    isRemote: true,
  };

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('includes provider on each remote account', async () => {
    global.fetch = mock((url: string) => {
      expect(url).toBe('https://remote.example.com:8317/v0/management/auth-files');
      return Promise.resolve(
        new Response(
          JSON.stringify({
            files: [
              {
                id: 'acc-codex',
                name: 'codex-main',
                type: 'oauth',
                provider: 'codex',
                email: 'codex@example.com',
                status: 'active',
                source: 'file',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );
    }) as typeof fetch;

    const result = await fetchRemoteAuthStatus(remoteTarget);

    expect(result).toHaveLength(1);
    expect(result[0]?.provider).toBe('codex');
    expect(result[0]?.accounts).toHaveLength(1);
    expect(result[0]?.accounts[0]?.provider).toBe('codex');
    expect(result[0]?.accounts[0]?.email).toBe('codex@example.com');
  });

  it('rejects local mode before issuing a request', async () => {
    const fetchMock = mock(() => Promise.reject(new Error('must not run')));
    global.fetch = fetchMock as typeof fetch;

    await expect(
      fetchRemoteAuthStatus({ ...remoteTarget, isRemote: false })
    ).rejects.toBeInstanceOf(ConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves management authentication failures as typed errors', async () => {
    global.fetch = mock(() => Promise.resolve(new Response('', { status: 401 }))) as typeof fetch;

    await expect(fetchRemoteAuthStatus(remoteTarget)).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects malformed and unsupported auth-file facts instead of dropping them', async () => {
    global.fetch = mock(() =>
      Promise.resolve(
        Response.json({
          files: [
            {
              id: 'unknown-auth',
              name: 'unknown-auth',
              provider: 'unknown-provider',
              status: 'active',
            },
          ],
        })
      )
    ) as typeof fetch;

    await expect(fetchRemoteAuthStatus(remoteTarget)).rejects.toBeInstanceOf(ProviderError);
    await expect(fetchRemoteAuthStatus(remoteTarget)).rejects.toThrow(
      'CLIProxy auth-files response.files[0].provider is unsupported: unknown-provider'
    );
  });

  it('classifies transport rejection as a typed network error', async () => {
    global.fetch = mock(() => Promise.reject(new TypeError('connection refused'))) as typeof fetch;

    await expect(fetchRemoteAuthStatus(remoteTarget)).rejects.toBeInstanceOf(NetworkError);
  });
});
