import { describe, expect, test } from 'bun:test';
import { getChecksumsUrl, getDownloadUrl, isAtLeastVersion } from '../platform-detector';

describe('plus backend release assets', () => {
  test('dc7 resolves against the renamed fork repository with lowercase no-plugin assets', () => {
    const url = getDownloadUrl('7.2.145-dc7', 'plus');
    expect(url).toStartWith(
      'https://github.com/marlon-costa-dc/cliproxy/releases/download/v7.2.145-dc7/'
    );
    expect(url).toContain('cliproxy_7.2.145-dc7_');
    expect(url).toEndWith('_no-plugin.tar.gz');
    expect(getChecksumsUrl('7.2.145-dc7', 'plus')).toBe(
      'https://github.com/marlon-costa-dc/cliproxy/releases/download/v7.2.145-dc7/checksums.txt'
    );
  });

  test('fork releases older than dc6 keep the uppercase asset prefix', () => {
    const url = getDownloadUrl('7.2.145-dc4', 'plus');
    expect(url).toStartWith(
      'https://github.com/marlon-costa-dc/cliproxy/releases/download/v7.2.145-dc4/'
    );
    expect(url).toContain('CLIProxyAPI_7.2.145-dc4_');
  });

  test('original backend keeps the upstream repository and uppercase prefix', () => {
    const url = getDownloadUrl('6.9.45', 'original');
    expect(url).toStartWith(
      'https://github.com/router-for-me/CLIProxyAPI/releases/download/v6.9.45/'
    );
    expect(url).toContain('CLIProxyAPI_6.9.45_');
  });
});

describe('fork release ordering', () => {
  test('dc suffixes compare numerically', () => {
    expect(isAtLeastVersion('7.2.145-dc7', '7.2.145-dc6')).toBe(true);
    expect(isAtLeastVersion('7.2.145-dc6', '7.2.145-dc7')).toBe(false);
    expect(isAtLeastVersion('7.2.145-dc10', '7.2.145-dc9')).toBe(true);
  });
});
