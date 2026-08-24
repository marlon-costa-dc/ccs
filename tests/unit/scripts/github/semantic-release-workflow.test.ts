import { describe, expect, test } from 'bun:test';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

const repoRoot = resolvePath('../../../..');

describe('semantic-release workflow', () => {
  test('is the sole package release owner on main', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/semantic-release.yml');
    const oldWorkflowPath = resolvePath('../../../../.github/workflows/dev-release.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);
    expect(fs.existsSync(oldWorkflowPath)).toBe(false);

    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('name: Semantic Release');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('npx semantic-release');
    expect(workflow).toContain('GITHUB_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).not.toContain('PAT_TOKEN');
    expect(workflow).not.toContain('NPM_TOKEN');
    expect(workflow).not.toContain('kaitranntt/ccs.extraheader');
    expect(workflow).not.toContain('branches: [dev]');
    expect(workflow).not.toContain('scripts/dev-release.sh');
  });

  test('keeps governance maintenance explicitly non-releasing', async () => {
    const require = createRequire(import.meta.url);
    const releaseConfig = require(path.join(repoRoot, '.releaserc.cjs')) as {
      plugins: Array<string | [string, Record<string, unknown>]>;
    };
    const analyzer = releaseConfig.plugins[0];

    expect(Array.isArray(analyzer)).toBe(true);
    if (!Array.isArray(analyzer)) throw new Error('Commit analyzer configuration is missing');

    const analyzerOptions = analyzer[1];
    const logger = { log: () => undefined };
    const analyze = (message: string) =>
      analyzeCommits(analyzerOptions, {
        cwd: repoRoot,
        commits: [{ hash: 'test-commit', message }],
        logger,
      });

    expect(await analyze('fix(governance): align repository policy')).toBeNull();
    expect(await analyze('fix(cli): correct profile lookup')).toBe('patch');
  });
});
