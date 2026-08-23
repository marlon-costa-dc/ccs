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
    expect(workflow).not.toContain('runs-on: [self-hosted');
    expect(workflow).not.toContain('NPM_TOKEN');
    expect(workflow).not.toContain('npx semantic-release');
    expect(workflow).toContain('Verify tag, package, and release provenance');
    expect(workflow).toContain('git merge-base --is-ancestor "$tag_commit" origin/main');
    expect(workflow).toContain('package_version="$(node -p');
    expect(workflow).toContain('gh release view "$TAG"');
    // One asset per platform: optional dependencies resolve per platform
    // (chokidar pulls fsevents on macOS only), so a single bundle would ship a
    // degraded tree everywhere but its build host.
    expect(workflow).toContain('ASSET=ccs_${version}_${PLATFORM}_package.tar.gz');
    expect(workflow).toContain('runs-on: ${{ matrix.runner }}');
    for (const platform of [
      'linux_amd64',
      'linux_arm64',
      'darwin_amd64',
      'darwin_arm64',
      'windows_amd64',
    ]) {
      expect(workflow, `release must build ${platform}`).toContain(`platform: ${platform}`);
    }
    // The artifact must be usable without a registry or a compiler.
    expect(workflow).toContain('npm install --omit=dev --ignore-scripts');
    expect(workflow).toContain('node_modules');
    expect(workflow).toContain('gh release upload "$TAG" "$ASSET" "$CHECKSUMS"');
    expect(workflow).not.toContain('gh release create');
    expect(workflow).not.toContain('--clobber');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });
});
