import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '../../../..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('main-only repository governance', () => {
  test('uses main across active CI, release, and pre-push branch surfaces', () => {
    const surfaces = [
      '.github/workflows/ci.yml',
      '.github/workflows/push-ci.yml',
      '.github/workflows/semantic-release.yml',
      '.github/workflows/promote-release.yml',
      '.github/pull_request_template.md',
      '.github/ISSUE_TEMPLATE/bug-report.yml',
      '.husky/pre-push',
      'scripts/ci-parity-gate.sh',
      '.beads/hooks/pre-push',
    ];

    for (const surface of surfaces) {
      const source = read(surface);
      expect(source).not.toContain('branches: [dev]');
      expect(source).not.toContain('origin/dev');
      expect(source).not.toContain('BASE_BRANCH="dev"');
      expect(source).not.toContain('CURRENT_BRANCH" == "dev"');
    }

    expect(read('.github/workflows/ci.yml')).toContain('branches: [main]');
    expect(read('.github/workflows/push-ci.yml')).toContain('branches: [main]');
    expect(read('.github/workflows/semantic-release.yml')).toContain('branches: [main]');
    const prePush = read('.husky/pre-push');
    expect(prePush).toContain('BASE_BRANCH="main"');
    expect(prePush).not.toContain('CCS_PR_BASE');
    expect(prePush).not.toContain('|| true');

    const ciParityGate = read('scripts/ci-parity-gate.sh');
    expect(ciParityGate).toContain('BASE_BRANCH="main"');
    expect(ciParityGate).not.toContain('CCS_PR_BASE');
    expect(ciParityGate).not.toContain('CCS_SKIP_PREPUSH_GATE');

    const beadsPrePush = read('.beads/hooks/pre-push');
    expect(beadsPrePush).toContain('bd hooks run pre-push');
    expect(beadsPrePush).not.toContain('bun run');
    expect(beadsPrePush).not.toContain('CCS_PR_BASE');
    expect(beadsPrePush).not.toContain('CCS_SKIP_PREPUSH_GATE');

    const pendingRelease = read('.github/workflows/label-pending-release.yml');
    expect(pendingRelease).toContain('branches: [main]');
    expect(pendingRelease).toContain('set -euo pipefail');
    expect(pendingRelease).toContain('--force');
    expect(pendingRelease).not.toContain('|| true');
    expect(pendingRelease).not.toContain('2>/dev/null');
  });

  test('removes superseded dev and manual package release owners', () => {
    const removedPaths = [
      '.github/workflows/dev-release.yml',
      '.github/workflows/sync-dev-after-release.yml',
      '.github/workflows/publish-npm.yml.deprecated',
      'scripts/dev-release.sh',
      'scripts/bump-version.sh',
      'scripts/github/stable-release-issue-cleanup.mjs',
      'scripts/github/stable-release-issue-cleanup-lib.mjs',
      'tests/unit/github/stable-release-issue-cleanup.test.mjs',
    ];

    for (const relativePath of removedPaths) {
      expect(fs.existsSync(path.join(repoRoot, relativePath))).toBe(false);
    }
  });
});
