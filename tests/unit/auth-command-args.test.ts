import { describe, expect, it } from 'bun:test';
import { parseArgs } from '../../src/auth/commands/types';

describe('auth command args parsing', () => {
  it('parses create with explicit shared context', () => {
    const parsed = parseArgs(['work', '--share-context']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.shareContext).toBe(true);
    expect(parsed.contextGroup).toBeUndefined();
  });

  it('parses context group with separate value', () => {
    const parsed = parseArgs(['work', '--context-group', 'sprint-a']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.shareContext).toBe(false);
    expect(parsed.contextGroup).toBe('sprint-a');
  });

  it('parses context group with equals form', () => {
    const parsed = parseArgs(['--context-group=sprint-a', 'work']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.contextGroup).toBe('sprint-a');
  });

  it('flags missing context group value as empty string', () => {
    const parsed = parseArgs(['work', '--context-group']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.contextGroup).toBe('');
  });

  it('flags empty inline context group as empty string', () => {
    const parsed = parseArgs(['work', '--context-group=']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.contextGroup).toBe('');
  });

  it('parses deeper continuity flag for create command', () => {
    const parsed = parseArgs(['work', '--share-context', '--deeper-continuity']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.shareContext).toBe(true);
    expect(parsed.deeperContinuity).toBe(true);
  });

  it('parses bare flag for create command', () => {
    const parsed = parseArgs(['work', '--bare']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.bare).toBe(true);
  });

  it('parses bare flag with shared context flags', () => {
    const parsed = parseArgs(['work', '--bare', '--share-context', '--context-group', 'sprint-a']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.bare).toBe(true);
    expect(parsed.shareContext).toBe(true);
    expect(parsed.contextGroup).toBe('sprint-a');
  });

  it('parses shared resource mode value for resources command', () => {
    const parsed = parseArgs(['work', '--mode', 'profile-local'], { allowMode: true });

    expect(parsed.profileName).toBe('work');
    expect(parsed.mode).toBe('profile-local');
  });

  it('parses inline shared resource mode value', () => {
    const parsed = parseArgs(['work', '--mode=shared'], { allowMode: true });

    expect(parsed.profileName).toBe('work');
    expect(parsed.mode).toBe('shared');
  });

  it('flags missing shared resource mode value as empty string', () => {
    const parsed = parseArgs(['work', '--mode'], { allowMode: true });

    expect(parsed.profileName).toBe('work');
    expect(parsed.mode).toBe('');
  });

  it('treats shared resource mode as unknown unless the command opts in', () => {
    const parsed = parseArgs(['work', '--mode', 'shared']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.mode).toBeUndefined();
    expect(parsed.unknownFlags).toEqual(['--mode']);
  });

  it('tracks unknown flags and keeps positional profile intact', () => {
    const parsed = parseArgs(['--foo', 'bar', 'work']);

    expect(parsed.profileName).toBe('work');
    expect(parsed.unknownFlags).toEqual(['--foo']);
  });
});
