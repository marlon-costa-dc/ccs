import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'bun:test';

describe('ccs launcher', () => {
  it('is executable and uses the versioned package runtime', () => {
    const launcherPath = join(import.meta.dir, '../../../bin/ccs');

    if (process.platform !== 'win32') {
      expect(statSync(launcherPath).mode & 0o777).toBe(0o755);
    }
    expect(readFileSync(launcherPath, 'utf8').startsWith('#!/usr/bin/env bash')).toBe(true);
  });
});
