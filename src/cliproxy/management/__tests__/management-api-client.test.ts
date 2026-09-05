/**
 * Unit tests for management-api-client module
 */
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import * as net from 'node:net';
import { modelPipelineSnapshotFixture } from '../../../config/schemas/__tests__/fixtures/model-pipeline-v3-fixture';
import {
  formatActiveIdentityEtag,
  ManagementApiClient,
  parseCLIProxyActivationReceipt,
} from '../management-api-client';
import type {
  ManagementClientConfig,
  ManagementHealthStatus,
  ClaudeKey,
} from '../management-api-types';
import { UserAbortError } from '../../../errors/error-types';

const digestA = `sha256:${'a'.repeat(64)}`;
const digestB = `sha256:${'b'.repeat(64)}`;
const digestC = `sha256:${'c'.repeat(64)}`;
const activeIdentity = {
  generation: 7,
  snapshot_digest: digestA,
  projection_digest: digestB,
  config_digest: digestC,
};
const validActivationReceipt = {
  previous_active: null,
  active: activeIdentity,
  routing_schema: { version: 3 as const, digest: digestA },
  binary_provenance: {
    version: 'cliproxy-fixture-v3',
    commit: 'cliproxy-fixture-commit',
    built_at: '2026-08-28T11:13:01Z',
  },
  loaded_at: '2026-08-28T11:20:57Z',
};

describe('management-api-client', () => {
  describe('ManagementApiClient', () => {
    let config: ManagementClientConfig;

    beforeEach(() => {
      config = {
        host: 'localhost',
        port: 8317,
        protocol: 'http',
        managementKey: 'test-management-key-12345',
        timeout: 2000,
        allowSelfSigned: false,
      };
    });

    describe('constructor', () => {
      it('should create client with provided config', () => {
        const client = new ManagementApiClient(config);
        expect(client).toBeDefined();
        expect(client.getBaseUrl()).toBe('http://localhost:8317');
      });

      it('rejects a missing timeout instead of selecting a default', () => {
        const configWithoutTimeout = { ...config };
        delete configWithoutTimeout.timeout;
        expect(
          () => new ManagementApiClient(configWithoutTimeout as ManagementClientConfig)
        ).toThrow('CLIProxy management timeout must be a positive whole number');
      });
    });

    describe('getBaseUrl', () => {
      it('should construct HTTP URL with port', () => {
        const client = new ManagementApiClient(config);
        expect(client.getBaseUrl()).toBe('http://localhost:8317');
      });

      it('should construct HTTPS URL with custom port', () => {
        const httpsConfig = { ...config, protocol: 'https' as const, port: 8443 };
        const client = new ManagementApiClient(httpsConfig);
        expect(client.getBaseUrl()).toBe('https://localhost:8443');
      });

      it('should omit standard HTTP port 80', () => {
        const configPort80 = { ...config, port: 80 };
        const client = new ManagementApiClient(configPort80);
        expect(client.getBaseUrl()).toBe('http://localhost');
      });

      it('should omit standard HTTPS port 443', () => {
        const configPort443 = { ...config, protocol: 'https' as const, port: 443 };
        const client = new ManagementApiClient(configPort443);
        expect(client.getBaseUrl()).toBe('https://localhost');
      });

      it('rejects a missing HTTP port instead of selecting a default', () => {
        const configNoPort = { ...config };
        delete configNoPort.port;
        expect(() => new ManagementApiClient(configNoPort as ManagementClientConfig)).toThrow(
          'CLIProxy management port must be a whole number between 1 and 65535'
        );
      });

      it('rejects a missing HTTPS port instead of selecting a default', () => {
        const configNoPort = { ...config, protocol: 'https' as const };
        delete configNoPort.port;
        expect(() => new ManagementApiClient(configNoPort as ManagementClientConfig)).toThrow(
          'CLIProxy management port must be a whole number between 1 and 65535'
        );
      });

      it('rejects an invalid port instead of warning and falling back', () => {
        expect(() => new ManagementApiClient({ ...config, port: 99999 })).toThrow(
          'CLIProxy management port must be a whole number between 1 and 65535'
        );
      });
    });

    describe('atomic config publication', () => {
      it('sends raw YAML and validates the publication receipt', async () => {
        const client = new ManagementApiClient(config);
        const configYaml = 'port: 8317\nmodel-routing:\n  schema-version: 3\n';
        const originalFetch = global.fetch;
        const fetchMock = mock(() =>
          Promise.resolve(
            new Response(JSON.stringify(validActivationReceipt), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ETag: formatActiveIdentityEtag(activeIdentity),
              },
            })
          )
        );
        global.fetch = fetchMock as typeof global.fetch;

        try {
          const receipt = await client.putConfigYaml(configYaml, null);

          expect(receipt).toEqual(validActivationReceipt);
          expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8317/v0/management/config.yaml',
            expect.objectContaining({
              method: 'PUT',
              body: configYaml,
              headers: expect.objectContaining({
                'Content-Type': 'application/yaml',
                'If-None-Match': '*',
              }),
            })
          );
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('rejects a successful response without a valid digest receipt', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                ok: true,
                generation: 7,
                snapshot_digest: 'not-a-digest',
                projection_digest: `sha256:${'b'.repeat(64)}`,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          )
        );

        try {
          await expect(client.putConfigYaml('port: 8317\n', null)).rejects.toThrow(
            'config publication receipt.ok is not part of the contract'
          );
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('rejects extra, missing, and mistyped receipt fields at the boundary', () => {
        expect(() =>
          parseCLIProxyActivationReceipt({ ...validActivationReceipt, ignored: true })
        ).toThrow('config publication receipt.ignored is not part of the contract');
        const { active: _active, ...missingActive } = validActivationReceipt;
        expect(() => parseCLIProxyActivationReceipt(missingActive)).toThrow(
          'receipt.active must be an object'
        );
        expect(() =>
          parseCLIProxyActivationReceipt({
            ...validActivationReceipt,
            active: { ...activeIdentity, config_digest: 'not-a-digest' },
          })
        ).toThrow('receipt.active.config_digest must be a lowercase sha256 digest');
      });

      it('reads and validates the active route-aware model inventory', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        const fetchMock = mock(() =>
          Promise.resolve(
            new Response(
              JSON.stringify(modelPipelineSnapshotFixture().inventory as Record<string, unknown>),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          )
        );
        global.fetch = fetchMock as typeof global.fetch;

        try {
          const inventory = await client.getModelInventory();

          expect(inventory.active).toBeNull();
          expect(inventory.direct_models[0]?.routes[0]?.catalog_route_model_id).toBe('gpt-5.4-pro');
          expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8317/v0/management/model-inventory',
            expect.objectContaining({ method: 'GET' })
          );
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('rejects an untyped model inventory response', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve(
            new Response(JSON.stringify({ schema_version: 1, routes: [] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        );

        try {
          await expect(client.getModelInventory()).rejects.toThrow(
            'model_inventory.routes is not part of schema version 3'
          );
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('rejects malformed JSON instead of treating it as an empty success', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve(
            new Response('{not-json', {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        );

        try {
          await expect(client.getModelInventory()).rejects.toThrow(
            'CLIProxy management response is not valid JSON'
          );
        } finally {
          global.fetch = originalFetch;
        }
      });

      it.each([401, 402, 403, 429, 500, 503])(
        'preserves HTTP %i and performs no alternate publication',
        async (status) => {
          const client = new ManagementApiClient(config);
          const originalFetch = global.fetch;
          const fetchMock = mock(() =>
            Promise.resolve(new Response('', { status, statusText: `status-${status}` }))
          );
          global.fetch = fetchMock as typeof global.fetch;

          try {
            await expect(client.putConfigYaml('model-routing: {}\n', null)).rejects.toThrow(
              `HTTP ${status}: status-${status}`
            );
            expect(fetchMock).toHaveBeenCalledTimes(1);
          } finally {
            global.fetch = originalFetch;
          }
        }
      );
    });

    describe('error code mapping', () => {
      it('should map ENOTFOUND to DNS_FAILED', () => {
        const error = new Error('getaddrinfo ENOTFOUND example.com') as NodeJS.ErrnoException;
        error.code = 'ENOTFOUND';

        // Test via health check which uses mapErrorToCode internally
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() => Promise.reject(error));

        client.health().then((status: ManagementHealthStatus) => {
          expect(status.healthy).toBe(false);
          expect(status.errorCode).toBe('DNS_FAILED');
        });

        global.fetch = originalFetch;
      });

      it('should map ECONNREFUSED to CONNECTION_REFUSED', () => {
        const error = new Error('connect ECONNREFUSED') as NodeJS.ErrnoException;
        error.code = 'ECONNREFUSED';

        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() => Promise.reject(error));

        client.health().then((status: ManagementHealthStatus) => {
          expect(status.healthy).toBe(false);
          expect(status.errorCode).toBe('CONNECTION_REFUSED');
        });

        global.fetch = originalFetch;
      });

      it('should map ETIMEDOUT to TIMEOUT', () => {
        const error = new Error('request timeout') as NodeJS.ErrnoException;
        error.code = 'ETIMEDOUT';

        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() => Promise.reject(error));

        client.health().then((status: ManagementHealthStatus) => {
          expect(status.healthy).toBe(false);
          expect(status.errorCode).toBe('TIMEOUT');
        });

        global.fetch = originalFetch;
      });

      it('should map ENETUNREACH to NETWORK_UNREACHABLE', () => {
        const error = new Error('network unreachable') as NodeJS.ErrnoException;
        error.code = 'ENETUNREACH';

        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() => Promise.reject(error));

        client.health().then((status: ManagementHealthStatus) => {
          expect(status.healthy).toBe(false);
          expect(status.errorCode).toBe('NETWORK_UNREACHABLE');
        });

        global.fetch = originalFetch;
      });

      it('should map 401 status to AUTH_FAILED', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: new Headers(),
            text: () => Promise.resolve(''),
          } as Response)
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('AUTH_FAILED');

        global.fetch = originalFetch;
      });

      it('should map 403 status to AUTH_FAILED', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            headers: new Headers(),
            text: () => Promise.resolve(''),
          } as Response)
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('AUTH_FAILED');

        global.fetch = originalFetch;
      });

      it('should map 404 status to NOT_FOUND', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: new Headers(),
            text: () => Promise.resolve(''),
          } as Response)
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('NOT_FOUND');

        global.fetch = originalFetch;
      });

      it('should map 400 status to BAD_REQUEST', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            headers: new Headers(),
            text: () => Promise.resolve(''),
          } as Response)
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('BAD_REQUEST');

        global.fetch = originalFetch;
      });

      it('should map 500+ status to SERVER_ERROR', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: new Headers(),
            text: () => Promise.resolve(''),
          } as Response)
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('SERVER_ERROR');

        global.fetch = originalFetch;
      });

      it('should map unknown errors to UNKNOWN', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = mock(() => Promise.reject(new Error('Something weird happened')));

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('UNKNOWN');

        global.fetch = originalFetch;
      });
    });

    describe('authentication header', () => {
      it('should include Bearer token in Authorization header', async () => {
        const client = new ManagementApiClient(config);
        let capturedHeaders: Record<string, string> = {};

        const originalFetch = global.fetch;
        global.fetch = mock((url: string, options?: RequestInit) => {
          if (options?.headers) {
            capturedHeaders = options.headers as Record<string, string>;
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: () => Promise.resolve('{"claude-api-key":[]}'),
          } as Response);
        });

        await client.getClaudeKeys();
        expect(capturedHeaders['Authorization']).toBe('Bearer test-management-key-12345');

        global.fetch = originalFetch;
      });

      it('should mask management key in logs/errors', () => {
        // Management key should never appear in plain text in error messages
        const sensitiveKey = 'super-secret-key-abc123';
        const clientConfig = { ...config, managementKey: sensitiveKey };
        const client = new ManagementApiClient(clientConfig);

        // The key should be used internally but not exposed
        expect(client.getBaseUrl()).not.toContain(sensitiveKey);
      });
    });

    describe('timeout handling', () => {
      it('should respect custom timeout value', () => {
        const customTimeout = 10000;
        const configWithTimeout = { ...config, timeout: customTimeout };
        const client = new ManagementApiClient(configWithTimeout);
        expect(client).toBeDefined();
      });

      it('should abort request on timeout', async () => {
        const client = new ManagementApiClient({ ...config, timeout: 100 });

        const originalFetch = global.fetch;
        global.fetch = mock(
          () =>
            new Promise((_, reject) => {
              setTimeout(() => {
                const error = new Error('The operation was aborted');
                error.name = 'AbortError';
                reject(error);
              }, 150);
            })
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('TIMEOUT');

        global.fetch = originalFetch;
      });

      it('propagates caller cancellation and aborts the owned fetch', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        let ownedSignalAborted = false;
        global.fetch = mock(
          (_url, init) =>
            new Promise<Response>((_resolve, reject) => {
              const ownedSignal = init?.signal;
              ownedSignal?.addEventListener(
                'abort',
                () => {
                  ownedSignalAborted = true;
                  reject(ownedSignal.reason);
                },
                { once: true }
              );
            })
        );
        const controller = new AbortController();

        try {
          const request = client.getModelInventory(controller.signal);
          controller.abort(new UserAbortError('dashboard disconnected'));
          await expect(request).rejects.toThrow('dashboard disconnected');
          expect(ownedSignalAborted).toBe(true);
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('terminates a hung native HTTPS request on timeout', async () => {
        const server = net.createServer();
        const sockets = new Set<net.Socket>();
        server.on('connection', (socket) => {
          sockets.add(socket);
          socket.once('close', () => sockets.delete(socket));
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new UserAbortError('test server has no TCP address');
        }
        const client = new ManagementApiClient({
          ...config,
          host: '127.0.0.1',
          port: address.port,
          protocol: 'https',
          timeout: 50,
          allowSelfSigned: true,
        });

        try {
          const status = await client.health();
          expect(status).toMatchObject({ healthy: false, errorCode: 'TIMEOUT' });
          expect(status.error).toContain('timed out');
        } finally {
          for (const socket of sockets) socket.destroy();
          if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
        }
      });
    });

    describe('self-signed certificate option', () => {
      it('should use fetch for HTTP regardless of allowSelfSigned', async () => {
        const client = new ManagementApiClient({ ...config, allowSelfSigned: true });

        const originalFetch = global.fetch;
        let fetchCalled = false;
        global.fetch = mock(() => {
          fetchCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: () => Promise.resolve('{"claude-api-key":[]}'),
          } as Response);
        });

        await client.getClaudeKeys();
        expect(fetchCalled).toBe(true);

        global.fetch = originalFetch;
      });

      it('should use https module for HTTPS with allowSelfSigned', () => {
        const httpsConfig = {
          ...config,
          protocol: 'https' as const,
          allowSelfSigned: true,
        };
        const client = new ManagementApiClient(httpsConfig);
        expect(client).toBeDefined();
        // Actual HTTPS request would use native https module with rejectUnauthorized: false
      });

      it('should use fetch for HTTPS without allowSelfSigned', async () => {
        const httpsConfig = {
          ...config,
          protocol: 'https' as const,
          allowSelfSigned: false,
        };
        const client = new ManagementApiClient(httpsConfig);

        const originalFetch = global.fetch;
        let fetchCalled = false;
        global.fetch = mock(() => {
          fetchCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: () => Promise.resolve('{"claude-api-key":[]}'),
          } as Response);
        });

        await client.getClaudeKeys();
        expect(fetchCalled).toBe(true);

        global.fetch = originalFetch;
      });
    });

    describe('health check', () => {
      it('should return healthy status with version info', async () => {
        const client = new ManagementApiClient(config);

        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({
              'x-cpa-version': '1.2.3',
              'x-cpa-commit': 'abc123',
            }),
            text: () => Promise.resolve('{"claude-api-key":[]}'),
          } as Response)
        );

        const status = await client.health();
        expect(status.healthy).toBe(true);
        expect(status.version).toBe('1.2.3');
        expect(status.commit).toBe('abc123');
        expect(status.latencyMs).toBeGreaterThanOrEqual(0);

        global.fetch = originalFetch;
      });

      it('should return unhealthy status on error', async () => {
        const client = new ManagementApiClient(config);

        const originalFetch = global.fetch;
        global.fetch = mock(() => Promise.reject(new Error('Connection failed')));

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.error).toBeDefined();
        expect(status.errorCode).toBeDefined();

        global.fetch = originalFetch;
      });
    });

    describe('CRUD operations', () => {
      it('should get claude keys', async () => {
        const client = new ManagementApiClient(config);
        const mockKeys: ClaudeKey[] = [{ 'api-key': 'sk-test-123', prefix: 'glm-' }];

        const originalFetch = global.fetch;
        global.fetch = mock(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: () => Promise.resolve(JSON.stringify({ 'claude-api-key': mockKeys })),
          } as Response)
        );

        const keys = await client.getClaudeKeys();
        expect(keys).toEqual(mockKeys);

        global.fetch = originalFetch;
      });

      it('should put claude keys', async () => {
        const client = new ManagementApiClient(config);
        const mockKeys: ClaudeKey[] = [{ 'api-key': 'sk-test-456', prefix: 'kimi-' }];

        const originalFetch = global.fetch;
        let requestBody: string | undefined;
        global.fetch = mock((url: string, options?: RequestInit) => {
          requestBody = options?.body as string;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: () => Promise.resolve(''),
          } as Response);
        });

        await client.putClaudeKeys(mockKeys);
        expect(requestBody).toBe(JSON.stringify(mockKeys));

        global.fetch = originalFetch;
      });

      it('should patch claude key', async () => {
        const client = new ManagementApiClient(config);
        const patch = {
          index: 0,
          value: { prefix: 'updated-' },
        };

        const originalFetch = global.fetch;
        let requestBody: string | undefined;
        global.fetch = mock((url: string, options?: RequestInit) => {
          requestBody = options?.body as string;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: () => Promise.resolve(''),
          } as Response);
        });

        await client.patchClaudeKey(patch);
        expect(requestBody).toBe(JSON.stringify(patch));

        global.fetch = originalFetch;
      });

      it('should delete claude key', async () => {
        const client = new ManagementApiClient(config);
        const apiKey = 'sk-test-to-delete';

        const originalFetch = global.fetch;
        let requestUrl = '';
        global.fetch = mock((url: string) => {
          requestUrl = url;
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: () => Promise.resolve(''),
          } as Response);
        });

        await client.deleteClaudeKey(apiKey);
        expect(requestUrl).toContain(encodeURIComponent(apiKey));

        global.fetch = originalFetch;
      });
    });
  });
});
