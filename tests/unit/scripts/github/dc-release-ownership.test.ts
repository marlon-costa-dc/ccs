import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('dc release ownership', () => {
  test('retires semantic-release and keeps the dc workflow as the sole release owner', () => {
    expect(fs.existsSync(resolvePath('../../../../.github/workflows/semantic-release.yml'))).toBe(
      false,
    );
    expect(fs.existsSync(resolvePath('../../../../.releaserc.cjs'))).toBe(false);

    const workflow = fs.readFileSync(
      resolvePath('../../../../.github/workflows/release-dc-use.yml'),
      'utf8',
    );

    expect(workflow).toContain('name: Release DC-Use');
    expect(workflow).toContain('-dc.');
    expect(workflow).toContain('gh release create');
    expect(workflow).toContain('--latest');
    expect(workflow).not.toContain('semantic-release');
    expect(workflow).not.toContain('--prerelease');
  });
});
