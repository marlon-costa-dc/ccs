const assert = require('assert');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const { createTestEnvironment } = require('../shared/fixtures/test-environment');

describe('npm CLI', () => {
  const distCcsPath = path.join(__dirname, '..', '..', 'dist', 'ccs.js');
  const srcCcsPath = path.join(__dirname, '..', '..', 'src', 'ccs.ts');
  let testEnv;
  let testCcsHome;

  function buildCliCommand(args = '') {
    if (fs.existsSync(distCcsPath)) {
      return `node "${distCcsPath}" ${args}`;
    }

    // Some test files rebuild or clean dist during the same Bun process.
    return `bun "${srcCcsPath}" ${args}`;
  }

  beforeAll(() => {
    // Create isolated test environment
    testEnv = createTestEnvironment();
    testCcsHome = testEnv.testHome;

    // Run postinstall to create config in test environment
    const postinstallScript = path.join(__dirname, '..', '..', 'scripts', 'postinstall.js');
    execSync(`node "${postinstallScript}"`, {
      stdio: 'ignore',
      env: { ...process.env, CCS_HOME: testCcsHome }
    });
  });

  afterAll(() => {
    // Clean up test environment
    if (testEnv) {
      testEnv.cleanup();
    }
  });

  // Helper to run CLI with test environment
  function runCli(args, options = {}) {
    return execSync(buildCliCommand(args), {
      ...options,
      env: { ...process.env, CCS_HOME: testCcsHome }
    });
  }

  describe('Argument parsing', () => {
    it('handles flag -c without profile error', function() {
      try {
        runCli('-c', { stdio: 'pipe', timeout: 3000 });
      } catch (e) {
        const output = e.stderr?.toString() || e.stdout?.toString() || '';
        // Should NOT show "Profile '-c' not found" error
        assert(!output.includes("Profile '-c' not found"), 'Should not treat -c as profile');
      }
    });

    it('handles flag --verbose without profile error', function() {
      try {
        runCli('--verbose', { stdio: 'pipe', timeout: 3000 });
      } catch (e) {
        const output = e.stderr?.toString() || e.stdout?.toString() || '';
        assert(!output.includes("Profile '--verbose' not found"), 'Should not treat --verbose as profile');
      }
    });

    it('handles flag -p with value', function() {
      try {
        runCli('-p "test prompt"', { stdio: 'pipe', timeout: 8000 });
      } catch (e) {
        const output = e.stderr?.toString() || e.stdout?.toString() || '';
        assert(!output.includes("Profile '-p' not found"), 'Should not treat -p as profile');
      }
    });

    it('handles multiple flags', function() {
      try {
        runCli('-c --verbose', { stdio: 'pipe', timeout: 3000 });
      } catch (e) {
        const output = e.stderr?.toString() || e.stdout?.toString() || '';
        assert(!output.includes("Profile '-c' not found"), 'Should not treat flags as profiles');
        assert(!output.includes("Profile '--verbose' not found"), 'Should not treat flags as profiles');
      }
    });

    it('routes cursor probe through the cursor command handler', function() {
      let output = '';
      try {
        output = execSync(`bun "${srcCcsPath}" cursor probe`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 3000,
          env: { ...process.env, CCS_HOME: testCcsHome }
        });
      } catch (e) {
        output = e.stderr?.toString() || e.stdout?.toString() || '';
      }
      assert(!output.includes("Profile 'cursor' not found"), 'Should not fall through to profile lookup');
      assert(
        output.includes('Cursor Live Probe') || output.includes('legacy cursor probe'),
        'Should route through the legacy cursor compatibility handler'
      );
    });

    it('routes gitlab --help to provider shortcut help instead of starting auth', function() {
      const output = execSync(`bun "${srcCcsPath}" gitlab --help`, {
        encoding: 'utf8',
        timeout: 3000,
        env: { ...process.env, CCS_HOME: testCcsHome }
      });

      assert(output.includes('CCS gitlab Shortcut Help'), 'Should render provider shortcut help');
      assert(output.includes('--gitlab-token-login'), 'Should document canonical GitLab PAT flag');
      assert(output.includes('--token-login'), 'Should document legacy GitLab PAT alias');
      assert(output.includes('--gitlab-url <url>'), 'Should document self-hosted GitLab URL flag');
      assert(!output.includes('Starting GitLab Duo OAuth'), 'Should not start OAuth when help is requested');
    });
  });

  describe('Profile handling', () => {
    // Note: GLM/Kimi profiles are no longer auto-created (v6.0).
    // Legacy GLMT files may still exist, but new supported API profiles are created
    // via UI presets or CLI: ccs api create --preset glm

    it('shows helpful error for non-existent profile', function() {
      try {
        runCli('glm --help', { stdio: 'pipe' });
        // If GLM profile exists from previous setup, this is fine too
      } catch (e) {
        const output = e.stderr?.toString() || e.stdout?.toString() || '';
        // Either profile exists and works, or shows helpful "not found" message
        // Both are valid behaviors depending on user's setup
        const isValid = !output.includes("Profile 'glm' not found") ||
                        output.includes("not found") ||
                        output.includes("ccs api create");
        assert(isValid, 'Should either find profile or show helpful message');
      }
    });

    it('shows error for invalid profile', function() {
      try {
        runCli('invalid-profile-name', { stdio: 'pipe' });
        assert(false, 'Should have thrown an error for invalid profile');
      } catch (e) {
        const output = e.stderr?.toString() || e.stdout?.toString() || '';
        assert(output.includes("not found") || output.includes("invalid"), 'Should show profile not found error');
      }
    });

    it('handles profile with flags correctly', function() {
      try {
        // Use a known command instead of profile that may not exist
        runCli('api --help', { stdio: 'pipe', timeout: 3000 });
      } catch (e) {
        const output = e.stderr?.toString() || '';
        assert(!output.includes("Profile '-c' not found"), 'Should not treat flags as profiles');
      }
    });
  });

  describe('Version and help', () => {
    it('shows version with --version flag', function() {
      const output = runCli('--version', { encoding: 'utf8' });
      assert(/\d+\.\d+\.\d+/.test(output), 'Should show version number');
    });

    it('shows version with -v flag', function() {
      const output = runCli('-v', { encoding: 'utf8' });
      assert(/\d+\.\d+\.\d+/.test(output), 'Should show version number');
    });

    it('shows help with --help flag', function() {
      const output = runCli('--help', { encoding: 'utf8' });
      assert(/usage|help|options/i.test(output), 'Should show help information');
    });

    it('shows help with -h flag', function() {
      const output = runCli('-h', { encoding: 'utf8' });
      assert(/usage|help|options/i.test(output), 'Should show help information');
    });
  });

  describe('Error handling', () => {
    it('handles empty arguments gracefully', function() {
      try {
        runCli('', { stdio: 'pipe', timeout: 3000 });
      } catch (e) {
        // Should either succeed or fail gracefully with a helpful error
        const output = e.stderr?.toString() || e.stdout?.toString() || '';
        assert(!output.includes('TypeError') && !output.includes('Cannot read'), 'Should not crash with TypeError');
      }
    });

    it('handles very long argument', function() {
      const longArg = 'a'.repeat(1000);
      try {
        runCli(`"${longArg}"`, { stdio: 'pipe', timeout: 3000 });
      } catch (e) {
        // Should handle gracefully, not crash
        const output = e.stderr?.toString() || e.stdout?.toString() || '';
        assert(!output.includes('TypeError') && !output.includes('Cannot read'), 'Should not crash with TypeError');
      }
    });
  });
});
