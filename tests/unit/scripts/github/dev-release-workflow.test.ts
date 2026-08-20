import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('dev release workflow', () => {
  test('does not auto-publish npm on push to dev', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/dev-release.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('name: Dev Release');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^on:\n  push:/m);
    expect(workflow).not.toContain('branches: [dev]');
  });

  test('keeps the legacy release script available for manual dispatch', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/dev-release.yml');
    const scriptPath = resolvePath('../../../../scripts/dev-release.sh');

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const script = fs.readFileSync(scriptPath, 'utf8');

    expect(workflow).toContain('should_release: ${{ steps.release-guard.outputs.should_release }}');
    expect(workflow).toContain('"chore(release): "*)');
    expect(workflow).toContain("needs.guard.outputs.should_release == 'true'");
    expect(script).toContain('git commit -m "chore(release): ${VERSION}"');
  });
});
