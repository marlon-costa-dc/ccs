/** Parse, merge, and serialize user-owned CLIProxy OAuth model aliases. */

import * as yaml from 'js-yaml';
import type {
  CLIProxyOAuthModelAliasConfig,
  CLIProxyOAuthModelAliasEntry,
} from '../../config/schemas/cliproxy';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAliasEntry(value: unknown): CLIProxyOAuthModelAliasEntry | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.alias !== 'string') {
    return null;
  }

  const name = value.name.trim();
  const alias = value.alias.trim();
  if (!name || !alias) {
    return null;
  }

  return {
    name,
    alias,
    ...(value.fork === true ? { fork: true } : {}),
  };
}

/**
 * Identity of one alias entry: the (name, alias) PAIR, not the alias alone.
 *
 * CLIProxyAPI supports sequential failover by repeating the same alias with
 * different upstream names; config order is the candidate order. Keying on the
 * alias alone collapses such a chain to its first entry, silently destroying
 * the failover pool. The upstream binary dedupes on the same pair
 * (internal/config/config_normalization.go), so this keeps both sides in
 * agreement.
 */
function aliasKey(entry: CLIProxyOAuthModelAliasEntry): string {
  return `${entry.name}\u0000${entry.alias}`;
}

export function parseOAuthModelAliasSection(body: string): CLIProxyOAuthModelAliasConfig {
  if (!body.trim()) {
    return {};
  }

  try {
    const parsed = yaml.load(`oauth-model-alias:\n${body}`);
    if (!isRecord(parsed) || !isRecord(parsed['oauth-model-alias'])) {
      return {};
    }

    const result = Object.create(null) as CLIProxyOAuthModelAliasConfig;
    for (const [provider, entries] of Object.entries(parsed['oauth-model-alias'])) {
      if (!provider.trim() || !Array.isArray(entries)) {
        continue;
      }

      const normalized = entries
        .map(normalizeAliasEntry)
        .filter((entry): entry is CLIProxyOAuthModelAliasEntry => entry !== null);
      if (normalized.length > 0) {
        result[provider] = normalized;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function mergeOAuthModelAliases(
  existing: CLIProxyOAuthModelAliasConfig,
  configured?: CLIProxyOAuthModelAliasConfig
): CLIProxyOAuthModelAliasConfig {
  const merged = Object.create(null) as CLIProxyOAuthModelAliasConfig;

  for (const [sourceIndex, source] of [existing, configured].entries()) {
    if (!isRecord(source)) {
      continue;
    }
    const replaceMatching = sourceIndex === 1;
    for (const [provider, rawEntries] of Object.entries(source)) {
      if (!provider.trim() || !Array.isArray(rawEntries)) {
        continue;
      }

      const entries = merged[provider] ?? [];
      const indexByKey = new Map(entries.map((entry, index) => [aliasKey(entry), index]));
      for (const rawEntry of rawEntries) {
        const entry = normalizeAliasEntry(rawEntry);
        if (!entry) {
          continue;
        }

        const key = aliasKey(entry);
        const existingIndex = indexByKey.get(key);
        if (existingIndex !== undefined) {
          if (replaceMatching) {
            entries[existingIndex] = entry;
          } else if (entry.fork) {
            entries[existingIndex] = { ...entries[existingIndex], fork: true };
          }
          continue;
        }

        indexByKey.set(key, entries.length);
        entries.push(entry);
      }

      if (entries.length > 0) {
        merged[provider] = entries;
      }
    }
  }

  return merged;
}

export function serializeOAuthModelAliasBody(config: CLIProxyOAuthModelAliasConfig): string {
  if (Object.keys(config).length === 0) {
    return '';
  }

  return yaml
    .dump(config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      noCompatMode: true,
      quotingType: '"',
    })
    .trimEnd()
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
