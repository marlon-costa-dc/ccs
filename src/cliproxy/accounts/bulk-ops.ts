/**
 * Bulk operations on accounts
 * Bulk pause/resume and solo mode functionality
 */

import { CLIProxyProvider } from '../types';
import { BulkOperationResult, SoloOperationResult } from './types';
import { pauseAccount, resumeAccount } from './registry';
import { getProviderAccounts } from './query';

/** Provider-level locks for preventing race conditions in solo mode */
const providerLocks = new Map<CLIProxyProvider, Promise<unknown>>();

/**
 * Bulk pause multiple accounts
 * Pauses each account, collecting successes and failures (no fail-fast)
 */
export function bulkPauseAccounts(
  provider: CLIProxyProvider,
  accountIds: string[]
): BulkOperationResult {
  const result: BulkOperationResult = { succeeded: [], failed: [] };

  for (const id of accountIds) {
    const success = pauseAccount(provider, id);
    if (success) {
      result.succeeded.push(id);
    } else {
      result.failed.push({ id, reason: 'Account not found' });
    }
  }

  return result;
}

/**
 * Bulk resume multiple accounts
 * Resumes each account, collecting successes and failures (no fail-fast)
 */
export function bulkResumeAccounts(
  provider: CLIProxyProvider,
  accountIds: string[]
): BulkOperationResult {
  const result: BulkOperationResult = { succeeded: [], failed: [] };

  for (const id of accountIds) {
    const success = resumeAccount(provider, id);
    if (success) {
      result.succeeded.push(id);
    } else {
      result.failed.push({ id, reason: 'Account not found' });
    }
  }

  return result;
}

/**
 * Solo mode: activate one account, pause all others in same provider
 * Per validation: auto-resumes target if paused, keeps default unchanged
 */
export async function soloAccount(
  provider: CLIProxyProvider,
  accountId: string
): Promise<SoloOperationResult | null> {
  // Wait for any pending operation on this provider
  const pending = providerLocks.get(provider);
  if (pending) await pending;

  const operation = (async () => {
    const accounts = getProviderAccounts(provider);
    const targetAccount = accounts.find((a) => a.id === accountId);

    if (!targetAccount) {
      return null;
    }

    const result: SoloOperationResult = { activated: accountId, paused: [] };

    // Resume target account if paused (per validation decision)
    if (targetAccount.paused) {
      resumeAccount(provider, accountId);
    }

    // Pause all other accounts
    for (const account of accounts) {
      if (account.id !== accountId && !account.paused) {
        const success = pauseAccount(provider, account.id);
        if (success) {
          result.paused.push(account.id);
        }
      }
    }

    return result;
  })();

  providerLocks.set(provider, operation);
  try {
    return await operation;
  } finally {
    providerLocks.delete(provider);
  }
}
