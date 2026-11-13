import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import * as yaml from 'js-yaml';
import { createEmptyUnifiedConfig } from '../../../config/schemas/unified-config';
import { saveUnifiedConfig } from '../../../config/unified-config-loader';
import { regenerateConfig } from '../generator';

const SECRET = 'management-secret-for-test';

let testHome = '';
let originalCcsHome: string | undefined;

function configPath(): string {
  return path.join(testHome, '.ccs', 'cliproxy', 'config.yaml');
}

function writtenSecretKey(): string {
  const parsed = yaml.load(readFileSync(configPath(), 'utf8')) as {
    'remote-management': { 'secret-key': string };
  };
  return parsed['remote-management']['secret-key'];
}

describe('CLIProxy management secret in the generated config', () => {
  beforeEach(() => {
    testHome = mkdtempSync(path.join(tmpdir(), 'ccs-secret-normalization-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = testHome;
    mkdirSync(path.dirname(configPath()), { recursive: true });
    const config = createEmptyUnifiedConfig();
    config.cliproxy.auth = { ...(config.cliproxy.auth ?? {}), management_secret: SECRET };
    saveUnifiedConfig(config);
  });

  afterEach(() => {
    if (originalCcsHome === undefined) delete process.env.CCS_HOME;
    else process.env.CCS_HOME = originalCcsHome;
    rmSync(testHome, { recursive: true, force: true });
  });

  it('is written as a bcrypt hash of the configured secret', () => {
    regenerateConfig(8317, { configPath: configPath() });
    const written = writtenSecretKey();
    expect(written).toMatch(/^\$2[aby]\$/);
    expect(bcrypt.compareSync(SECRET, written)).toBe(true);
  });

  it('keeps the existing hash while it still matches the secret', () => {
    regenerateConfig(8317, { configPath: configPath() });
    const first = writtenSecretKey();
    regenerateConfig(8317, { configPath: configPath() });
    expect(writtenSecretKey()).toBe(first);
  });

  it('replaces a hash that no longer matches the secret', () => {
    regenerateConfig(8317, { configPath: configPath() });
    const first = writtenSecretKey();
    const config = createEmptyUnifiedConfig();
    config.cliproxy.auth = { ...(config.cliproxy.auth ?? {}), management_secret: `${SECRET}-rotated` };
    saveUnifiedConfig(config);
    regenerateConfig(8317, { configPath: configPath() });
    const rotated = writtenSecretKey();
    expect(rotated).not.toBe(first);
    expect(bcrypt.compareSync(`${SECRET}-rotated`, rotated)).toBe(true);
  });
});
