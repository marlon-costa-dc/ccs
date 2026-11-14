/**
 * Shared Copilot command tokens and aliases.
 * Keep all copilot subcommand routing in one place to avoid drift.
 */

export const COPILOT_SUBCOMMANDS = [
  'auth',
  'status',
  'models',
  'usage',
  'start',
  'stop',
  'enable',
  'disable',
] as const;

export type CopilotSubcommand = (typeof COPILOT_SUBCOMMANDS)[number];

export const COPILOT_FLAG_ALIASES: Readonly<Record<`--${CopilotSubcommand}`, CopilotSubcommand>> =
  Object.freeze({
    '--auth': 'auth',
    '--status': 'status',
    '--models': 'models',
    '--usage': 'usage',
    '--start': 'start',
    '--stop': 'stop',
    '--enable': 'enable',
    '--disable': 'disable',
  });

export const COPILOT_SUBCOMMAND_TOKENS = Object.freeze([
  ...COPILOT_SUBCOMMANDS,
  ...Object.keys(COPILOT_FLAG_ALIASES),
  'help',
  '--help',
  '-h',
]);

export function normalizeCopilotSubcommand(token?: string): string | undefined {
  if (!token) return token;
  const alias = COPILOT_FLAG_ALIASES[token as keyof typeof COPILOT_FLAG_ALIASES];
  return alias || token;
}

export function isCopilotSubcommandToken(token?: string): boolean {
  return Boolean(token) && COPILOT_SUBCOMMAND_TOKENS.includes(token as string);
}
