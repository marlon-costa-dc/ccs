import { describe, expect, it } from 'bun:test';
import {
  COPILOT_SUBCOMMANDS,
  COPILOT_SUBCOMMAND_TOKENS,
  normalizeCopilotSubcommand,
} from '../../../src/copilot/constants';

describe('copilot command aliases', () => {
  it('normalizes all supported flag aliases', () => {
    for (const subcommand of COPILOT_SUBCOMMANDS) {
      expect(normalizeCopilotSubcommand(`--${subcommand}`)).toBe(subcommand);
    }
  });

  it('keeps canonical subcommands unchanged', () => {
    for (const subcommand of COPILOT_SUBCOMMANDS) {
      expect(normalizeCopilotSubcommand(subcommand)).toBe(subcommand);
    }
  });

  it('returns unknown tokens unchanged', () => {
    expect(normalizeCopilotSubcommand('--unknown')).toBe('--unknown');
    expect(normalizeCopilotSubcommand('unknown')).toBe('unknown');
  });

  it('exposes complete routing token list for ccs entrypoint', () => {
    for (const subcommand of COPILOT_SUBCOMMANDS) {
      expect(COPILOT_SUBCOMMAND_TOKENS).toContain(subcommand);
      expect(COPILOT_SUBCOMMAND_TOKENS).toContain(`--${subcommand}`);
    }
    expect(COPILOT_SUBCOMMAND_TOKENS).toContain('help');
    expect(COPILOT_SUBCOMMAND_TOKENS).toContain('--help');
    expect(COPILOT_SUBCOMMAND_TOKENS).toContain('-h');
  });
});
