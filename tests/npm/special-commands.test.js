const assert = require('assert');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

describe('integration: special commands', () => {
  const distCcsPath = path.join(__dirname, '..', '..', 'dist', 'ccs.js');
  const srcCcsPath = path.join(__dirname, '..', '..', 'src', 'ccs.ts');

  function buildCliCommand(args = '') {
    if (fs.existsSync(distCcsPath)) {
      return `node "${distCcsPath}" ${args}`;
    }

    // Some tests rebuild or clean dist during the same Bun run.
    return `bun "${srcCcsPath}" ${args}`;
  }

  it('shows version with --version', () => {
    const output = execSync(buildCliCommand('--version'), { encoding: 'utf8' });
    assert(output.includes('CCS (Claude Codex Switch)'));
    assert(/v\d+\.\d+\.\d+/.test(output));
  });

  it('shows version with -v', () => {
    const output = execSync(buildCliCommand('-v'), { encoding: 'utf8' });
    assert(/v\d+\.\d+\.\d+/.test(output));
  });

  it('shows help with --help', function() {
    // Note: Requires claude installation, so we just test that it doesn't crash
    try {
      const output = execSync(buildCliCommand('--help'), {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      // If we get here, claude was found and help was shown
    } catch (e) {
      // Expected if claude is not installed
      assert(e.message.includes('Claude CLI not found') || e.status === 1);
    }
  });

  it('handles --install command', () => {
    const output = execSync(buildCliCommand('--install'), { encoding: 'utf8' });
    assert(output.includes('Feature not available'));
    assert(output.includes('under development'));
    assert(output.includes('.claude/ integration testing'));
  });

  it('handles --uninstall command', () => {
    const output = execSync(buildCliCommand('--uninstall'), { encoding: 'utf8' });
    assert(output.includes('Uninstalling CCS'));
    assert(output.includes('[OK] Uninstall complete!') || output.includes('Nothing to uninstall'));
  });

});
