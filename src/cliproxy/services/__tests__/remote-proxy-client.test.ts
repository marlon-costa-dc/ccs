import { afterEach, describe, expect, it } from 'bun:test';
import { checkRemoteProxy, type RemoteProxyClientConfig } from '../../services/remote-proxy-client';

const servers: Bun.Server<unknown>[] = [];

function config(port: number): RemoteProxyClientConfig {
  return {
    host: '127.0.0.1',
    port,
    protocol: 'http',
    timeout: 250,
    allowSelfSigned: false,
  };
}

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.stop(true);
  }
});

describe('remote-proxy-client', () => {
  it('uses the explicit target and reports a reachable HTTP endpoint', async () => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('ok') });
    servers.push(server);

    await expect(checkRemoteProxy(config(server.port))).resolves.toMatchObject({
      reachable: true,
    });
  });

  it('rejects missing, malformed, and zero operational values before network I/O', async () => {
    const invalidCases: ReadonlyArray<readonly [Partial<RemoteProxyClientConfig>, string]> = [
      [{ host: '' }, 'Remote CLIProxy host is required'],
      [{ port: 0 }, 'Remote CLIProxy port must be a whole number between 1 and 65535'],
      [{ port: 1.5 }, 'Remote CLIProxy port must be a whole number between 1 and 65535'],
      [
        { protocol: 'ftp' as RemoteProxyClientConfig['protocol'] },
        'Remote CLIProxy protocol must equal http or https',
      ],
      [{ timeout: 0 }, 'Remote CLIProxy timeout must be a positive whole number'],
      [{ timeout: undefined }, 'Remote CLIProxy timeout must be a positive whole number'],
      [{ allowSelfSigned: undefined }, 'Remote CLIProxy allowSelfSigned policy is required'],
    ];

    for (const [override, message] of invalidCases) {
      let failure: unknown;
      try {
        await checkRemoteProxy({ ...config(9_999), ...override } as RemoteProxyClientConfig);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(message);
    }
  });

  it('returns a non-success result for an HTTP authentication failure', async () => {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => new Response(null, { status: 401 }),
    });
    servers.push(server);

    await expect(checkRemoteProxy(config(server.port))).resolves.toEqual({
      reachable: false,
      error: 'Authentication failed - check auth token',
      errorCode: 'AUTH_FAILED',
    });
  });
});
