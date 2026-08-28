/**
 * Unit tests for proxy-resolver.ts (Phase 03 extraction)
 *
 * Tests cover the proxy resolution + remote reachability + binary acquisition
 * logic extracted from executor/index.ts.
 */

import { beforeEach, describe, expect, it, jest } from 'bun:test';
import type { ResolveExecutorProxyContext } from '../proxy-resolver';
import type { ExecutorConfig } from '../../types';
import type { UnifiedConfig } from '../../../config/schemas/unified-config';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockEnsureCLIProxyBinary = jest.fn().mockResolvedValue('/usr/local/bin/cliproxy');
const mockGetConfiguredBackend = jest.fn().mockReturnValue('original');
const mockGetPlusBackendUnavailableMessage = jest.fn().mockReturnValue('Plus backend unavailable');
const mockInstallCliproxyVersion = jest.fn().mockResolvedValue(undefined);
const mockFetchLatestCliproxyVersion = jest.fn().mockResolvedValue('test-version');
const mockCheckCliproxyUpdate = jest.fn().mockResolvedValue({ available: false });

jest.mock('../../binary-manager', () => ({
  ensureCLIProxyBinary: mockEnsureCLIProxyBinary,
  getConfiguredBackend: mockGetConfiguredBackend,
  getPlusBackendUnavailableMessage: mockGetPlusBackendUnavailableMessage,
  getStoredConfiguredBackend: mockGetConfiguredBackend,
  getCLIProxyPath: jest.fn().mockReturnValue('/usr/local/bin/cliproxy'),
  getInstalledCliproxyVersion: jest.fn().mockReturnValue('test-version'),
  isCLIProxyInstalled: jest.fn().mockReturnValue(true),
  resolveLocalBackend: mockGetConfiguredBackend,
  syncPlusFallbackStateIfNeeded: jest.fn(),
  installCliproxyVersion: mockInstallCliproxyVersion,
  fetchLatestCliproxyVersion: mockFetchLatestCliproxyVersion,
  checkCliproxyUpdate: mockCheckCliproxyUpdate,
  getPinnedVersion: jest.fn().mockReturnValue(null),
  savePinnedVersion: jest.fn(),
  clearPinnedVersion: jest.fn(),
  isVersionPinned: jest.fn().mockReturnValue(false),
  getVersionPinPath: jest.fn().mockReturnValue('/tmp/cliproxy-version-pin'),
  BinaryManager: class {},
}));

const mockCheckRemoteProxy = jest.fn();
jest.mock('../../services/remote-proxy-client', () => ({
  checkRemoteProxy: mockCheckRemoteProxy,
}));

jest.mock('../failure-handler', () => ({
  isNetworkError: jest.fn().mockReturnValue(false),
  handleNetworkError: jest.fn(),
  handleTokenExpiration: jest.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const { resolveExecutorProxy, resolveExecutorProxyConfig } = await import('../proxy-resolver');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUnifiedConfig(remote = false): UnifiedConfig {
  return {
    cliproxy_server: {
      management_timeout_ms: 2_000,
      remote: {
        enabled: remote,
        host: remote ? '192.168.1.100' : '',
        port: remote ? 9443 : undefined,
        protocol: remote ? 'https' : 'http',
        auth_token: remote ? 'remote-token' : '',
        management_key: remote ? 'management-key' : undefined,
        allow_self_signed: false,
      },
      local: {
        port: 8317,
        auto_start: true,
      },
    },
  } as unknown as UnifiedConfig;
}

function makeBaseCfg(): ExecutorConfig {
  return {
    port: 8317,
    timeout: 5000,
    verbose: false,
    pollInterval: 100,
  };
}

function makeContext(
  overrides: Partial<ResolveExecutorProxyContext> = {}
): ResolveExecutorProxyContext {
  return {
    unifiedConfig: makeUnifiedConfig(),
    allProviders: ['gemini'],
    verbose: false,
    cfg: makeBaseCfg(),
    log: jest.fn(),
    ...overrides,
  };
}

async function resolveProxyForTest(args: string[], context = makeContext()) {
  const resolvedConfig = resolveExecutorProxyConfig(args, context);
  return resolveExecutorProxy(resolvedConfig, context);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureCLIProxyBinary.mockResolvedValue('/usr/local/bin/cliproxy');
  mockGetConfiguredBackend.mockReturnValue('original');
});

describe('resolveExecutorProxy — local mode', () => {
  it('returns useRemoteProxy=false and correct binary for local mode', async () => {
    const result = await resolveProxyForTest(['--verbose']);

    expect(result.useRemoteProxy).toBe(false);
    expect(result.localBackend).toBe('original');
    expect(result.binaryPath).toBe('/usr/local/bin/cliproxy');
    expect(result.argsWithoutProxy).toEqual(['--verbose']);
  });

  it('passes arguments through without maintaining a proxy override surface', async () => {
    const result = await resolveProxyForTest(['clean-arg']);

    expect(result.argsWithoutProxy).toEqual(['clean-arg']);
    expect(result.useRemoteProxy).toBe(false);
  });

  it('does not call checkRemoteProxy in local mode', async () => {
    await resolveProxyForTest([]);

    expect(mockCheckRemoteProxy).not.toHaveBeenCalled();
  });
});

describe('resolveExecutorProxy — remote mode reachable', () => {
  it('returns useRemoteProxy=true when remote proxy is reachable', async () => {
    mockCheckRemoteProxy.mockResolvedValue({ reachable: true, latencyMs: 12, error: undefined });

    const result = await resolveProxyForTest(
      [],
      makeContext({ unifiedConfig: makeUnifiedConfig(true) })
    );

    expect(result.useRemoteProxy).toBe(true);
  });

  it('skips binary acquisition when remote proxy is reachable', async () => {
    mockCheckRemoteProxy.mockResolvedValue({ reachable: true, latencyMs: 5, error: undefined });

    const result = await resolveProxyForTest(
      [],
      makeContext({ unifiedConfig: makeUnifiedConfig(true) })
    );

    expect(result.binaryPath).toBeUndefined();
    expect(mockEnsureCLIProxyBinary).not.toHaveBeenCalled();
  });
});

describe('resolveExecutorProxy — remote mode unreachable', () => {
  it('preserves the first remote failure and never acquires a local binary', async () => {
    mockCheckRemoteProxy.mockResolvedValue({ reachable: false, error: 'Connection refused' });

    await expect(
      resolveProxyForTest([], makeContext({ unifiedConfig: makeUnifiedConfig(true) }))
    ).rejects.toThrow('Remote proxy unreachable: Connection refused');
    expect(mockCheckRemoteProxy).toHaveBeenCalledTimes(1);
    expect(mockEnsureCLIProxyBinary).not.toHaveBeenCalled();
  });
});

describe('resolveExecutorProxy — proxyConfig propagated in result', () => {
  it('returns the resolved proxyConfig object', async () => {
    const result = await resolveProxyForTest([]);

    expect(result.proxyConfig).toBeDefined();
    expect(result.proxyConfig.mode).toBe('local');
    expect(result.proxyConfig.port).toBe(8317);
  });

  it('returns mutated cfg with validated port', async () => {
    const ctx = makeContext();

    const result = await resolveProxyForTest([], ctx);

    // cfg is mutated in place and also returned
    expect(result.cfg).toBe(ctx.cfg);
    expect(result.cfg.port).toBe(8317);
  });
});
