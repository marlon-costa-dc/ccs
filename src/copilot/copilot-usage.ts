/**
 * Copilot Usage Fetcher
 *
 * Fetches usage/quota data from copilot-api `/usage` endpoint and normalizes it
 * for CLI and dashboard consumers.
 */

import * as http from 'http';
import type { CopilotQuotaSnapshot, CopilotUsage } from './types';
import { clampPercent } from '../utils/percentage';

interface RawCopilotQuotaSnapshot {
  entitlement?: number;
  remaining?: number;
  percent_remaining?: number;
  unlimited?: boolean;
}

interface RawCopilotUsage {
  copilot_plan?: string;
  quota_reset_date?: string;
  quota_snapshots?: {
    premium_interactions?: RawCopilotQuotaSnapshot;
    chat?: RawCopilotQuotaSnapshot;
    completions?: RawCopilotQuotaSnapshot;
  };
}

function normalizeSnapshot(raw?: RawCopilotQuotaSnapshot): CopilotQuotaSnapshot {
  const entitlement = Number(raw?.entitlement ?? 0);
  const remaining = Number(raw?.remaining ?? 0);
  const safeEntitlement = Number.isFinite(entitlement) && entitlement > 0 ? entitlement : 0;
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  const used = Math.max(0, safeEntitlement - safeRemaining);

  const percentRemainingFromApi =
    raw && typeof raw.percent_remaining === 'number' ? raw.percent_remaining : null;
  const percentRemaining =
    percentRemainingFromApi !== null
      ? clampPercent(percentRemainingFromApi)
      : safeEntitlement > 0
        ? clampPercent((safeRemaining / safeEntitlement) * 100)
        : 0;

  return {
    entitlement: safeEntitlement,
    remaining: safeRemaining,
    used,
    percentRemaining,
    percentUsed: clampPercent(100 - percentRemaining),
    unlimited: Boolean(raw?.unlimited),
  };
}

export function normalizeCopilotUsage(raw: unknown): CopilotUsage {
  const usage = (raw || {}) as RawCopilotUsage;
  const snapshots = usage.quota_snapshots || {};

  return {
    plan: usage.copilot_plan ?? null,
    quotaResetDate: usage.quota_reset_date ?? null,
    quotas: {
      premiumInteractions: normalizeSnapshot(snapshots.premium_interactions),
      chat: normalizeSnapshot(snapshots.chat),
      completions: normalizeSnapshot(snapshots.completions),
    },
  };
}

/**
 * Fetch Copilot usage from running copilot-api daemon.
 *
 * @returns normalized usage on success, null on daemon/network/parsing failure
 */
export async function fetchCopilotUsageFromDaemon(port: number): Promise<CopilotUsage | null> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/usage',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200 || !data) {
            resolve(null);
            return;
          }

          try {
            const parsed = JSON.parse(data) as unknown;
            resolve(normalizeCopilotUsage(parsed));
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => {
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

export async function getCopilotUsage(port: number): Promise<CopilotUsage | null> {
  return fetchCopilotUsageFromDaemon(port);
}
