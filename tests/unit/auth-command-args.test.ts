import { describe, expect, it } from 'bun:test';
import { parseArgs } from '../../src/auth/commands/types';

describe('auth command args parsing', () => {
  it('extracts a positional profile name alongside boolean flags', () => {
    const parsed = parseArgs(['work', '--share-context', '--bare']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.shareContext).toBe(true);
    expect(parsed.bare).toBe(true);
    expect(parsed.deeperContinuity).toBe(false);
  });

  it('separates a positional profile from a value flag with a separate token', () => {
    const parsed = parseArgs(['personal', '--context-group', 'sprint-a']);

    expect(parsed.profileName).toBe('personal');
    expect(parsed.shareContext).toBe(false);
    expect(parsed.contextGroup).toBe('sprint-a');
    expect(parsed.bare).toBe(false);
  });

  it('parses the equals form of a value flag and keeps the positional', () => {
    const parsed = parseArgs(['agentic', '--context-group=sprint-b']);

    expect(parsed.profileName).toBe('agentic');
    expect(parsed.contextGroup).toBe('sprint-b');
  });

  it('flags a missing context-group value as an empty string', () => {
    const parsed = parseArgs(['work', '--context-group']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.contextGroup).toBe('');
  });

  it('flags an empty inline context-group as an empty string', () => {
    const parsed = parseArgs(['work', '--context-group=']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.contextGroup).toBe('');
  });

  it('parses deeper continuity alongside shared context', () => {
    const parsed = parseArgs(['work', '--share-context', '--deeper-continuity']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.shareContext).toBe(true);
    expect(parsed.deeperContinuity).toBe(true);
  });

  it('parses shared resource mode only when the caller opts in', () => {
    const withoutOptIn = parseArgs(['work', '--mode', 'shared']);
    const withOptIn = parseArgs(['work', '--mode', 'shared'], { allowMode: true });

    expect(withoutOptIn.mode).toBeUndefined();
    expect(withoutOptIn.unknownFlags).toEqual(['--mode']);
    expect(withOptIn.profileName).toBe('work');
    expect(withOptIn.mode).toBe('shared');
  });

  it('parses an inline mode value when the caller opts in', () => {
    const parsed = parseArgs(['ops', '--mode=shared'], { allowMode: true });

    expect(parsed.profileName).toBe('ops');
    expect(parsed.mode).toBe('shared');
  });

  it('flags a missing mode value as an empty string when opted in', () => {
    const parsed = parseArgs(['ops', '--mode'], { allowMode: true });

    expect(parsed.profileName).toBe('ops');
    expect(parsed.mode).toBe('');
  });

  it('keeps the positional profile intact while collecting unknown flags', () => {
    const parsed = parseArgs(['--foo', 'bar', 'work']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.unknownFlags).toEqual(['--foo']);
  });

  it('does not consume the positional as the value of an unknown flag', () => {
    const parsed = parseArgs(['work', '--unknown', 'ignored-value']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.unknownFlags).toEqual(['--unknown']);
  });

  it('extracts any non-flag token as the profile name regardless of spelling', () => {
    const cases = ['work', 'personal', 'agentic', 'ops', 'release-candidate'];
    for (const profileName of cases) {
      const parsed = parseArgs([profileName, '--share-context']);

      expect(parsed.profileName).toBe(profileName);
      expect(parsed.shareContext).toBe(true);
    }
  });
});
