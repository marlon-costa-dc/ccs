import { describe, expect, it } from 'bun:test';

import {
  isLoopbackHost,
  isWildcardHost,
  normalizeDashboardHost,
  resolveDashboardUrls,
} from '../../../src/commands/config-dashboard-host';
import { DOCKER_DEFAULT_DASHBOARD_PORT as DASHBOARD_PORT } from '../../../src/docker/docker-assets';

describe('config dashboard host helpers', () => {
  it('detects loopback and wildcard hosts', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isWildcardHost('0.0.0.0')).toBe(true);
    expect(isWildcardHost('::')).toBe(true);
    expect(isWildcardHost('[::]')).toBe(true);
  });

  it('returns localhost browser URL without network details when host is omitted', () => {
    const urls = resolveDashboardUrls(undefined, DASHBOARD_PORT, {});

    expect(urls.bindHost).toBeUndefined();
    expect(urls.browserUrl).toBe(`http://localhost:${DASHBOARD_PORT}`);
    expect(urls.networkUrls).toBeUndefined();
  });

  it('returns localhost browser URL and all detected external URLs for wildcard host', () => {
    const urls = resolveDashboardUrls('0.0.0.0', DASHBOARD_PORT, {
      en0: [
        {
          address: '192.168.1.25',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: false,
          cidr: '192.168.1.25/24',
        },
      ],
      utun5: [
        {
          address: '100.64.0.12',
          family: 'IPv4',
          internal: false,
        },
      ],
    });

    expect(urls.browserUrl).toBe(`http://localhost:${DASHBOARD_PORT}`);
    expect(urls.networkUrls).toEqual([
      `http://192.168.1.25:${DASHBOARD_PORT}`,
      `http://100.64.0.12:${DASHBOARD_PORT}`,
    ]);
  });

  it('returns explicit host URL for loopback bindings', () => {
    const urls = resolveDashboardUrls('127.0.0.1', DASHBOARD_PORT, {});

    expect(urls.bindHost).toBe('127.0.0.1');
    expect(urls.browserUrl).toBe(`http://127.0.0.1:${DASHBOARD_PORT}`);
    expect(urls.networkUrls).toBeUndefined();
  });

  it('normalizes bracketed IPv6 host literals for binding and URL output', () => {
    const urls = resolveDashboardUrls('[::1]', DASHBOARD_PORT, {});

    expect(normalizeDashboardHost('[::1]')).toBe('::1');
    expect(urls.bindHost).toBe('::1');
    expect(urls.browserUrl).toBe(`http://[::1]:${DASHBOARD_PORT}`);
  });

  it('returns localhost-only URLs when no external interfaces are available', () => {
    // Real boundary: an empty interface map yields no external IPv4 URLs, so the
    // resolver must fall back to localhost-only URLs without mocking os.networkInterfaces.
    const urls = resolveDashboardUrls('::', DASHBOARD_PORT, {});

    expect(urls.bindHost).toBe('::');
    expect(urls.browserUrl).toBe(`http://localhost:${DASHBOARD_PORT}`);
    expect(urls.networkUrls).toBeUndefined();
  });
});
