import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function workflowsDir() {
  return path.resolve(import.meta.dir, '../../../../.github/workflows');
}

const GITHUB_HOSTED_ACTIVE_WORKFLOWS = [
  'ci.yml',
  'push-ci.yml',
  'release.yml',
  'docs-parity.yml',
  'label-pending-release.yml',
  'breaking-change-guard.yml',
];

describe('self-hosted runner policy', () => {
  test('runs active CI and release workflows on GitHub-hosted runners', () => {
    for (const file of GITHUB_HOSTED_ACTIVE_WORKFLOWS) {
      const workflow = fs.readFileSync(path.join(workflowsDir(), file), 'utf8');
      expect(workflow, `${file} must use ubuntu-latest`).toContain('runs-on: ubuntu-latest');
      expect(workflow, `${file} must not require a self-hosted runner`).not.toContain(
        'runs-on: [self-hosted'
      );
    }
  });

  test('breaking-change guard scopes compose contract checks to services.ccs', () => {
    const workflow = fs.readFileSync(path.join(workflowsDir(), 'breaking-change-guard.yml'), 'utf8');

    expect(workflow).toContain('OLD_RAW=$(service_field_value "$BASE_COMPOSE" ccs image)');
    expect(workflow).toContain('NEW_RAW=$(service_field_value docker/compose.yaml ccs image)');
    expect(workflow).toContain('has_service_network_effective_name docker/compose.yaml ccs ccs-net');
    expect(workflow).toContain('OLD_CN=$(service_field_value "$BASE_COMPOSE" ccs container_name');
    expect(workflow).not.toContain("grep -m1 '^[[:space:]]*image:'");
    expect(workflow).not.toContain('services.ccs.hostname override');
  });

  test('gates pull-request worker deploys to trusted authors', () => {
    const workflow = fs.readFileSync(path.join(workflowsDir(), 'deploy-ccs-worker.yml'), 'utf8');

    expect(workflow).toContain("github.event_name != 'pull_request'");
    expect(workflow).toContain(
      'contains(fromJSON(\'["COLLABORATOR","MEMBER","OWNER"]\'), github.event.pull_request.author_association)'
    );
  });

  test('gates pull-request workflows that check out code', () => {
    const trustedAuthorGate =
      'contains(fromJSON(\'["COLLABORATOR","MEMBER","OWNER"]\'), github.event.pull_request.author_association)';
    const workflowFiles = fs
      .readdirSync(workflowsDir())
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));

    for (const file of workflowFiles) {
      const workflow = fs.readFileSync(path.join(workflowsDir(), file), 'utf8');

      if (workflow.includes('pull_request_target:')) {
        expect(workflow, `${file} must not check out code from pull_request_target`).not.toContain(
          'uses: actions/checkout'
        );
      }

      if (
        workflow.includes('pull_request:') &&
        workflow.includes('uses: actions/checkout') &&
        file !== 'breaking-change-guard.yml'
      ) {
        expect(workflow, `${file} must gate PR checkout to trusted authors`).toContain(
          trustedAuthorGate
        );
      }
    }
  });
});
