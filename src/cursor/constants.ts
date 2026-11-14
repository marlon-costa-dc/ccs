export const LEGACY_CURSOR_PROFILE_NAME = 'legacy-cursor';

export const CURSOR_SUBCOMMANDS = [
  'auth',
  'status',
  'probe',
  'models',
  'start',
  'stop',
  'enable',
  'disable',
  'help',
  '--help',
  '-h',
] as const;

export const CURSOR_CLIPROXY_SHORTCUT_FLAGS = new Set([
  '--auth',
  '--logout',
  '--config',
  '--accounts',
]);

export function isCursorSubcommandToken(token?: string): boolean {
  return (
    Boolean(token) && CURSOR_SUBCOMMANDS.includes(token as (typeof CURSOR_SUBCOMMANDS)[number])
  );
}

export function shouldUseCursorCliproxyShortcut(args: string[]): boolean {
  if (args[0] !== 'cursor') {
    return false;
  }

  for (const token of args.slice(1)) {
    if (token === '--') {
      break;
    }
    if (CURSOR_CLIPROXY_SHORTCUT_FLAGS.has(token)) {
      return true;
    }
    if (!token.startsWith('-')) {
      return false;
    }
  }

  return false;
}
