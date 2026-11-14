import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('dc release workflow', () => {
  test('creates stable upstream-version-dc releases from dc-use', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/release-dc-use.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('name: Release DC-Use');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).not.toContain('runs-on: [self-hosted');
    expect(workflow).toContain('origin/main');
    expect(workflow).toContain('-dc.');
    expect(workflow).toContain('RELEASE_VERSION');
    expect(workflow).toContain('bash scripts/build-release-asset.sh');
    expect(workflow).toContain('bun run validate:ci-parity');
    expect(workflow).toContain('gh release create');
    expect(workflow).toContain('--latest');
    expect(workflow).not.toContain('--prerelease');
    expect(workflow).not.toContain('semantic-release');
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');

    const packer = fs.readFileSync(
      resolvePath('../../../../scripts/build-release-asset.sh'),
      'utf8',
    );
    expect(packer).toContain('RELEASE_VERSION');
    expect(packer).toContain('npm pack --ignore-scripts --pack-destination "$scratch"');
    expect(packer).toContain('package_tarballs=("$scratch"/*.tgz)');
    expect(packer).toContain('manifest.files');
    expect(packer).toContain('cp bun.lock "$bundle/bun.lock"');
    expect(packer).toContain('bun install');
    expect(packer).toContain('--cwd "$bundle"');
    expect(packer).toContain('--production');
    expect(packer).toContain('--frozen-lockfile');
    expect(packer).toContain('rm "$bundle/bun.lock"');
    expect(packer).not.toContain('cp -a node_modules');
    expect(packer).toContain('^[A-Za-z0-9][A-Za-z0-9._-]*$');

    const manifest = JSON.parse(
      fs.readFileSync(resolvePath('../../../../package.json'), 'utf8'),
    ) as { files: string[] };
    expect(manifest.files).toContain('config/');
    expect(manifest.files).toContain('claude-mods/');
    expect(manifest.files).not.toContain('schemas/model-pipeline-snapshot-v3.json');
  });
});
