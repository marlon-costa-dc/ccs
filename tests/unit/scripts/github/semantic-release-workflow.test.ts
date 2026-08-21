import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

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
    expect(workflow).not.toContain('branches: [dev]');
    expect(workflow).not.toContain('scripts/dev-release.sh');
  });
});
