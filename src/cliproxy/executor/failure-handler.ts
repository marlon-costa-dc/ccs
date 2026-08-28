/** Fail-fast handling for executor-owned network and token failures. */

import { fail, warn } from '../../utils/ui';
import { createLogger } from '../../services/logging';
import { CLIProxyProvider } from '../types';
import { handleBanDetection, warnPossible403Ban } from '../accounts/account-safety';

const logger = createLogger('cliproxy:executor:failure-handler');

export function isNetworkError(error: Error): boolean {
  const networkErrors = [
    'getaddrinfo',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENETUNREACH',
    'EAI_AGAIN',
  ];
  return networkErrors.some((errorCode) => error.message.includes(errorCode));
}

export function handleNetworkError(_error: Error): never {
  process.stderr.write('\n');
  process.stderr.write(`${fail('No network connection detected')}\n\n`);
  process.stderr.write('CLIProxy binary download requires internet access.\n');
  process.stderr.write('Please check your network connection and try again.\n\n');
  process.exit(1);
}

export async function handleTokenExpiration(
  provider: CLIProxyProvider,
  verbose: boolean
): Promise<void> {
  const { ensureTokenValid } = await import('../auth/token-manager');
  const tokenResult = await ensureTokenValid(provider, verbose);

  if (!tokenResult.valid) {
    if (tokenResult.error) {
      const { getDefaultAccount } = await import('../accounts/account-manager');
      const account = getDefaultAccount(provider);
      if (account) handleBanDetection(provider, account.id, tokenResult.error);
      warnPossible403Ban(provider, tokenResult.error);
    }

    process.stderr.write(`${warn('OAuth token expired and refresh failed')}\n`);
    if (tokenResult.error) process.stderr.write(`    ${tokenResult.error}\n`);
    process.stderr.write(`    Run "ccs ${provider} --auth" to re-authenticate\n`);
    process.exit(1);
  }

  if (tokenResult.refreshed && verbose) {
    logger.info('token.refreshed', 'Token was refreshed proactively', { provider, verbose });
  }
}
