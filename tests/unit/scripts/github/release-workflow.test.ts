import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('stable release workflow', () => {
  test('publishes GitHub-only package assets from tags', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/release.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('name: GitHub Release');
    expect(workflow).toContain("tags:");
    expect(workflow).toContain("- 'v*'");
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).not.toContain('runs-on: [self-hosted');
    expect(workflow).not.toContain('NPM_TOKEN');
    expect(workflow).not.toContain('semantic-release');
    expect(workflow).toContain('ccs_${VERSION}_package.tar.gz');
    expect(workflow).toContain('gh release create');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });
});
