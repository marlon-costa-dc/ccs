import { describe, expect, it } from 'bun:test';

import {
  type CLIProxyBackendMinVersions,
  compareCliproxyVersions,
  isNewerVersion,
  meetsBackendMinimumVersion,
} from '../version-checker';

describe('cliproxy version comparison', () => {
  it('treats missing fork release suffix as zero', () => {
    expect(compareCliproxyVersions('6.6.81', '6.6.81-0')).toBe(0);
    expect(isNewerVersion('6.6.81-0', '6.6.81')).toBe(false);
  });

  it('orders patched fork release suffixes after core version equality', () => {
    expect(compareCliproxyVersions('7.1.31-1', '7.1.31-0')).toBe(1);
    expect(compareCliproxyVersions('7.1.31-0', '7.1.31-1')).toBe(-1);
    expect(isNewerVersion('7.1.31-1', '7.1.31-0')).toBe(true);
  });

  it('lets core version precedence win before fork release suffixes', () => {
    expect(compareCliproxyVersions('7.1.32-0', '7.1.31-99')).toBe(1);
    expect(isNewerVersion('7.1.31-99', '7.1.32-0')).toBe(false);
  });
});

describe('meetsBackendMinimumVersion', () => {
  const testMinimums: CLIProxyBackendMinVersions = {
    original: '7.2.104',
    plus: '7.2.105-0',
  };

  it('evaluates original backend boundary correctly', () => {
    expect(meetsBackendMinimumVersion('7.2.103', 'original', testMinimums)).toBe(false);
    expect(meetsBackendMinimumVersion('7.2.104', 'original', testMinimums)).toBe(true);
    expect(meetsBackendMinimumVersion('7.2.105', 'original', testMinimums)).toBe(true);
  });

  it('evaluates plus backend boundary with fork suffixes correctly', () => {
    expect(meetsBackendMinimumVersion('7.2.104-9', 'plus', testMinimums)).toBe(false);
    expect(meetsBackendMinimumVersion('7.2.105-0', 'plus', testMinimums)).toBe(true);
    expect(meetsBackendMinimumVersion('7.2.105-1', 'plus', testMinimums)).toBe(true);
  });

  it('treats missing fork suffix as equal to -0', () => {
    const minWithSuffix: CLIProxyBackendMinVersions = {
      original: '6.8.34-0',
      plus: '6.8.34-0',
    };
    expect(meetsBackendMinimumVersion('6.8.34', 'original', minWithSuffix)).toBe(true);
    expect(meetsBackendMinimumVersion('6.8.34', 'plus', minWithSuffix)).toBe(true);
  });

  it('rejects empty and invalid version strings against real minimums', () => {
    expect(meetsBackendMinimumVersion('', 'original', testMinimums)).toBe(false);
    expect(meetsBackendMinimumVersion('not-a-version', 'original', testMinimums)).toBe(false);
    expect(meetsBackendMinimumVersion('', 'plus', testMinimums)).toBe(false);
    expect(meetsBackendMinimumVersion('not-a-version', 'plus', testMinimums)).toBe(false);
  });
});
