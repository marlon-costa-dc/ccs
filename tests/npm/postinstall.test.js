const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');
const { createTestEnvironment } = require('../shared/fixtures/test-environment');

describe('npm postinstall', () => {
  let testEnv;
  const postinstallScript = path.join(__dirname, '..', '..', 'scripts', 'postinstall.js');

  beforeEach(() => {
    // Create isolated test environment for each test
    testEnv = createTestEnvironment();
  });

  afterEach(() => {
    // Clean up test environment
    if (testEnv) {
      testEnv.cleanup();
    }
  });

  it('creates config.yaml (primary format)', () => {
    execSync(`node "${postinstallScript}"`, {
      stdio: 'ignore',
      env: { ...process.env, CCS_HOME: testEnv.testHome }
    });

    // config.yaml is now the primary format (v6.x+)
    assert(testEnv.fileExists('config.yaml'), 'config.yaml should be created');

    // Read YAML config and verify structure
    const yaml = require('js-yaml');
    const configContent = testEnv.readFile('config.yaml', false);
    const config = yaml.load(configContent);

    assert(config.profiles !== undefined, 'config.yaml should have profiles');
    assert(typeof config.profiles === 'object', 'profiles should be an object');
    // Profiles are now empty by default - users create via presets
    assert.deepStrictEqual(config.profiles, {}, 'profiles should be empty by default');
    assert(config.version, 'config.yaml should have version');
  });

  it('does NOT auto-create glm.settings.json (v6.0 - use presets instead)', () => {
    execSync(`node "${postinstallScript}"`, {
      stdio: 'ignore',
      env: { ...process.env, CCS_HOME: testEnv.testHome }
    });

    // GLM/Kimi profiles are NO LONGER auto-created during install.
    // Legacy glmt.settings.json files may still exist from older setups.
    // Users create supported API profiles via UI presets or CLI: ccs api create --preset glm
    assert(!testEnv.fileExists('glm.settings.json'), 'glm.settings.json should NOT be auto-created');
    assert(!testEnv.fileExists('glmt.settings.json'), 'glmt.settings.json should NOT be auto-created');
    assert(!testEnv.fileExists('kimi.settings.json'), 'kimi.settings.json should NOT be auto-created');
  });

  it('is idempotent', () => {
    const env = { ...process.env, CCS_HOME: testEnv.testHome };
    const yaml = require('js-yaml');

    // Run postinstall first time
    execSync(`node "${postinstallScript}"`, { stdio: 'ignore', env });

    // Create custom config.yaml to test preservation
    const customConfig = {
      version: '2.0',
      profiles: {
        custom: '~/.custom.json',
        glm: '~/.ccs/glm.settings.json'
      },
      accounts: {},
      cliproxy: { variants: {}, oauth_accounts: {} }
    };
    const yamlContent = yaml.dump(customConfig, { indent: 2 });
    testEnv.createFile('config.yaml', yamlContent);

    // Run postinstall again
    execSync(`node "${postinstallScript}"`, { stdio: 'ignore', env });

    // Verify custom config preserved
    const configContent = testEnv.readFile('config.yaml', false);
    const config = yaml.load(configContent);
    assert(config.profiles.custom, 'Custom profile should be preserved');
    assert.strictEqual(config.profiles.custom, '~/.custom.json');
  });

  it('uses ASCII symbols', () => {
    const output = execSync(`node "${postinstallScript}"`, {
      encoding: 'utf8',
      env: { ...process.env, CCS_HOME: testEnv.testHome }
    });

    // Check for ASCII symbols [OK], [!], [X], [i] - not emojis
    assert(/\[(OK|!|X|i)\]/.test(output), 'Should use ASCII symbols, not emojis');

    // Verify no emojis in output
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    assert(!emojiRegex.test(output), 'Should not contain emojis');
  });

  it('handles existing directory gracefully', () => {
    // Create directory manually first
    testEnv.createFile('existing.txt', 'exists');

    // Run postinstall
    execSync(`node "${postinstallScript}"`, {
      stdio: 'ignore',
      env: { ...process.env, CCS_HOME: testEnv.testHome }
    });

    // Verify existing file still exists and new files are created
    assert(testEnv.fileExists('existing.txt'), 'Existing files should be preserved');
    assert(testEnv.fileExists('config.yaml'), 'config.yaml should be created');
    // GLM/Kimi are no longer auto-created. Legacy GLMT files remain untouched if present.
    assert(!testEnv.fileExists('glm.settings.json'), 'glm.settings.json should NOT be auto-created');
  });

  it('does not create VERSION file', () => {
    execSync(`node "${postinstallScript}"`, {
      stdio: 'ignore',
      env: { ...process.env, CCS_HOME: testEnv.testHome }
    });

    // The postinstall script doesn't create VERSION file (only native install does)
    assert(!testEnv.fileExists('VERSION'), 'VERSION file should NOT be created by npm postinstall');
  });
});
