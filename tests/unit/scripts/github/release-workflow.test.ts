import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('release asset packaging workflow', () => {
  test('packages semantic-release tags without creating or overwriting releases', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/release.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('name: Package GitHub Release Assets');
    expect(workflow).toContain("tags:");
    expect(workflow).toContain("- 'v*'");
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).not.toContain('runs-on: [self-hosted');
    expect(workflow).not.toContain('NPM_TOKEN');
    expect(workflow).not.toContain('npx semantic-release');
    expect(workflow).toContain('Verify tag, package, and release provenance');
    expect(workflow).toContain('git merge-base --is-ancestor "$tag_commit" origin/main');
    expect(workflow).toContain('package_version="$(node -p');
    expect(workflow).toContain('gh release view "$TAG"');
    expect(workflow).toContain('ASSET=ccs_${version}_package.tar.gz');
    expect(workflow).toContain('bash scripts/build-release-asset.sh');
    expect(workflow).not.toContain('-czf "$ASSET"');
    expect(workflow).toContain('gh release upload "$TAG" "$ASSET" "$CHECKSUMS"');
    expect(workflow).not.toContain('gh release create');
    expect(workflow).not.toContain('--clobber');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');

    const packer = fs.readFileSync(
      resolvePath('../../../../scripts/build-release-asset.sh'),
      'utf8'
    );
    expect(packer).toContain('npm pack --ignore-scripts --json | node');
    expect(packer).toContain('fs.readFileSync(0, "utf8")');
    expect(packer).toContain('manifest.files');
    expect(packer).toContain('cp -a node_modules "$bundle/node_modules"');
    expect(packer).toContain('^[A-Za-z0-9][A-Za-z0-9._-]*$');
  });
});
