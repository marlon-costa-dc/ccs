import { describe, expect, it } from 'bun:test';
import {
  renderCapturedLines,
  useDockerSubcommandConsoleCapture,
} from './docker-subcommand-test-helpers';

const capture = useDockerSubcommandConsoleCapture();

async function loadHandleConfig() {
  const mod = await import(
    `../../../src/commands/docker/config-subcommand?test=${Date.now()}-${Math.random()}`
  );
  return mod.handleConfig;
}

describe('docker config subcommand', () => {
  it('prints the derived Docker configuration table', async () => {
    const dockerModule = (await import(
      '../../../src/docker'
    )) as typeof import('../../../src/docker');
    const originalGetConfig = dockerModule.DockerExecutor.prototype.getConfig;
    dockerModule.DockerExecutor.prototype.getConfig = function () {
      return {
        host: 'docker-box',
        remote: true,
        ccsDir: '/tmp/.ccs',
        dockerDir: '/tmp/docker',
        composeFile: '/tmp/docker/docker-compose.integrated.yml',
        dockerfile: '/tmp/docker/Dockerfile.integrated',
        supervisordConfig: '/tmp/docker/supervisord.conf',
        entrypoint: '/tmp/docker/entrypoint-integrated.sh',
        remoteDeployDir: '~/.ccs/docker',
        composeService: 'ccs-cliproxy',
        containerName: 'ccs-cliproxy',
        dashboardPort: 3000,
        proxyPort: 8317,
      };
    };

    try {
      const handleConfig = await loadHandleConfig();
      await handleConfig(['--host', 'docker-box']);

      const rendered = renderCapturedLines(capture.logLines);
      expect(rendered).toContain('remote (docker-box)');
      expect(rendered).toContain('/tmp/docker/docker-compose.integrated.yml');
      expect(rendered).toContain('ccs-cliproxy');
      expect(capture.errorLines).toEqual([]);
      expect(process.exitCode).toBe(0);
    } finally {
      dockerModule.DockerExecutor.prototype.getConfig = originalGetConfig;
    }
  });

  it('renders thrown config errors as boxed failures', async () => {
    const dockerModule = (await import(
      '../../../src/docker'
    )) as typeof import('../../../src/docker');
    const originalGetConfig = dockerModule.DockerExecutor.prototype.getConfig;
    dockerModule.DockerExecutor.prototype.getConfig = function () {
      throw new Error('Missing bundled Docker asset: /tmp/docker/Dockerfile.integrated');
    };

    try {
      const handleConfig = await loadHandleConfig();
      await handleConfig([]);

      const rendered = renderCapturedLines(capture.errorLines);
      expect(rendered).toContain('Missing bundled Docker asset');
      expect(process.exitCode).toBe(1);
    } finally {
      dockerModule.DockerExecutor.prototype.getConfig = originalGetConfig;
    }
  });
});
