/**
 * `ccs bar install` — removed.
 *
 * The command has been removed. External download of the CCS Bar app
 * via GitHub releases is no longer supported through this CLI.
 */

export async function handleBarInstall(_args: string[]): Promise<void> {
  console.error('[X] ccs bar install: command removed');
  console.error('[i] CCS Bar download via this CLI is no longer available.');
  process.exitCode = 1;
}
