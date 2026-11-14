import { describe, expect, it } from 'bun:test';
import { shouldUseCursorCliproxyShortcut } from '../../../src/cursor/constants';

describe('cursor CLIProxy shortcut routing', () => {
  it('accepts shortcut flags after leading generic flags', () => {
    expect(shouldUseCursorCliproxyShortcut(['cursor', '--auth'])).toBe(true);
    expect(shouldUseCursorCliproxyShortcut(['cursor', '--verbose', '--auth'])).toBe(true);
    expect(shouldUseCursorCliproxyShortcut(['cursor', '-v', '--accounts'])).toBe(true);
  });

  it('stops scanning once a positional legacy runtime argument appears', () => {
    expect(shouldUseCursorCliproxyShortcut(['cursor', 'write', '--auth'])).toBe(false);
    expect(shouldUseCursorCliproxyShortcut(['cursor', 'status'])).toBe(false);
  });
});
