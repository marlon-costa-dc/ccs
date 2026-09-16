import { describe, expect, it } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { WebSearchCliInfo } from '../../../../src/utils/websearch/types';
import { clearAgyCliCache } from '../../../../src/utils/websearch/agy';
import {
  buildWebSearchReadiness,
  getWebSearchCliProviders,
} from '../../../../src/utils/websearch/status';

function provider(
  overrides: Partial<WebSearchCliInfo> & Pick<WebSearchCliInfo, 'id' | 'name'>
): WebSearchCliInfo {
  return {
    id: overrides.id,
    kind: overrides.kind ?? 'backend',
    name: overrides.name,
    enabled: overrides.enabled ?? false,
    available: overrides.available ?? false,
    version: overrides.version ?? null,
    requiresApiKey: overrides.requiresApiKey ?? false,
    description: overrides.description ?? '',
    detail: overrides.detail ?? '',
    ...overrides,
  };
}

describe('websearch readiness', () => {
  it('is ready by default because DuckDuckGo is enabled', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: true,
        available: true,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('ready');
    expect(readiness.message).toContain('DuckDuckGo');
  });

  it('reports setup required when only Tavily is enabled without an API key', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'tavily',
        name: 'Tavily',
        enabled: true,
        available: false,
        requiresApiKey: true,
        apiKeyEnvVar: 'TAVILY_API_KEY',
        detail: 'Set TAVILY_API_KEY',
      }),
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: false,
        available: false,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('needs_setup');
    expect(readiness.message).toContain('Tavily');
    expect(readiness.message).toContain('TAVILY_API_KEY');
  });

  it('prefers API-backed readiness when Exa is enabled and configured', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'exa',
        name: 'Exa',
        enabled: true,
        available: true,
        requiresApiKey: true,
        apiKeyEnvVar: 'EXA_API_KEY',
        detail: 'API key detected (5 results)',
      }),
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: false,
        available: false,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('ready');
    expect(readiness.message).toContain('Exa');
  });

  it('treats SearXNG as ready when enabled with a valid URL', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'searxng',
        name: 'SearXNG',
        enabled: true,
        available: true,
        detail: 'Configured (5 results)',
      }),
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: false,
        available: false,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('ready');
    expect(readiness.message).toContain('SearXNG');
  });

  it(
    'marks SearXNG as unavailable when config uses a query-bearing endpoint URL',
    { timeout: 15000 },
    () => {
      const tempHome = mkdtempSync(path.join(tmpdir(), 'websearch-status-'));
      const originalCcsHome = process.env.CCS_HOME;
      process.env.CCS_HOME = tempHome;
      const ccsDir = path.join(tempHome, '.ccs');
      mkdirSync(path.join(ccsDir, 'cache'), { recursive: true });
      writeFileSync(
        path.join(ccsDir, 'config.yaml'),
        'version: 1\nwebsearch:\n  enabled: true\n  providers:\n    exa:\n      enabled: false\n      max_results: 5\n    tavily:\n      enabled: false\n      max_results: 5\n    brave:\n      enabled: false\n      max_results: 5\n    searxng:\n      enabled: true\n      url: "https://search.example.com/search?format=json"\n      max_results: 5\n    duckduckgo:\n      enabled: false\n      max_results: 5\n    gemini:\n      enabled: false\n    grok:\n      enabled: false\n    opencode:\n      enabled: false\n',
        'utf8'
      );

      try {
        const providers = getWebSearchCliProviders();
        const searxng = providers.find((entry) => entry.id === 'searxng');

        expect(searxng?.enabled).toBe(true);
        expect(searxng?.available).toBe(false);
        expect(searxng?.detail).toContain('Set a valid SearXNG base URL');
      } finally {
        process.env.CCS_HOME = originalCcsHome;
        rmSync(tempHome, { recursive: true, force: true });
      }
    }
  );

  it('marks SearXNG as unavailable when enabled with a blank URL', { timeout: 15000 }, () => {
    const tempHome = mkdtempSync(path.join(tmpdir(), 'websearch-status-'));
    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    mkdirSync(path.join(ccsDir, 'cache'), { recursive: true });
    writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      'version: 1\nwebsearch:\n  enabled: true\n  providers:\n    exa:\n      enabled: false\n      max_results: 5\n    tavily:\n      enabled: false\n      max_results: 5\n    brave:\n      enabled: false\n      max_results: 5\n    searxng:\n      enabled: true\n      url: ""\n      max_results: 5\n    duckduckgo:\n      enabled: false\n      max_results: 5\n    gemini:\n      enabled: false\n    grok:\n      enabled: false\n    opencode:\n      enabled: false\n',
      'utf8'
    );

    try {
      const providers = getWebSearchCliProviders();
      const searxng = providers.find((entry) => entry.id === 'searxng');

      expect(searxng?.enabled).toBe(true);
      expect(searxng?.available).toBe(false);
      expect(searxng?.detail).toContain('Set a valid SearXNG base URL');
    } finally {
      process.env.CCS_HOME = originalCcsHome;
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it(
    'exposes Antigravity (agy) as a recommended CLI provider when enabled and installed',
    { timeout: 15000 },
    () => {
      const tempHome = mkdtempSync(path.join(tmpdir(), 'websearch-status-agy-'));
      const originalCcsHome = process.env.CCS_HOME;
      const originalPath = process.env.PATH;
      process.env.CCS_HOME = tempHome;

      const ccsDir = path.join(tempHome, '.ccs');
      mkdirSync(path.join(ccsDir, 'cache'), { recursive: true });
      writeFileSync(
        path.join(ccsDir, 'config.yaml'),
        'version: 1\nwebsearch:\n  enabled: true\n  providers:\n    exa:\n      enabled: false\n      max_results: 5\n    tavily:\n      enabled: false\n      max_results: 5\n    brave:\n      enabled: false\n      max_results: 5\n    searxng:\n      enabled: false\n      url: ""\n      max_results: 5\n    duckduckgo:\n      enabled: false\n      max_results: 5\n    agy:\n      enabled: true\n      model: gemini-2.5-flash\n      timeout: 90\n    gemini:\n      enabled: false\n    grok:\n      enabled: false\n    opencode:\n      enabled: false\n',
        'utf8'
      );

      // Hermetic installation: ship a fake agy binary on PATH instead of
      // depending on the host having Antigravity CLI installed.
      const binDir = path.join(tempHome, 'bin');
      mkdirSync(binDir, { recursive: true });
      const agyShim = path.join(binDir, 'agy');
      writeFileSync(
        agyShim,
        '#!/bin/sh\ncase "$1" in --version) echo "Antigravity CLI 1.2.3";; *) echo agy;; esac\n'
      );
      chmodSync(agyShim, 0o755);
      process.env.PATH = `${binDir}:${originalPath ?? ''}`;
      clearAgyCliCache();

      try {
        const providers = getWebSearchCliProviders();
        const agy = providers.find((entry) => entry.id === 'agy');

        expect(agy?.name).toBe('Antigravity CLI');
        expect(agy?.kind).toBe('legacy-cli');
        expect(agy?.command).toBe('agy');
        expect(agy?.enabled).toBe(true);
        expect(agy?.available).toBe(true);
        expect(agy?.requiresApiKey).toBe(false);
        expect(agy?.installCommand).toContain('antigravity.google');
        expect(agy?.detail).toContain('Installed');

        const readiness = buildWebSearchReadiness(true, providers);
        expect(readiness.readiness).toBe('ready');
        expect(readiness.message).toContain('Antigravity CLI');
      } finally {
        process.env.PATH = originalPath;
        clearAgyCliCache();
        process.env.CCS_HOME = originalCcsHome;
        rmSync(tempHome, { recursive: true, force: true });
      }
    }
  );

  it(
    'treats cooled-down providers as temporarily unavailable in readiness status',
    { timeout: 15000 },
    () => {
      const tempHome = mkdtempSync(path.join(tmpdir(), 'websearch-status-cooldown-'));
      const statePath = path.join(tempHome, '.ccs', 'cache', 'websearch-provider-state.json');
      const originalCcsHome = process.env.CCS_HOME;

      mkdirSync(path.join(tempHome, '.ccs', 'cache'), { recursive: true });
      writeFileSync(
        statePath,
        JSON.stringify(
          {
            cooldowns: {
              exa: {
                until: Date.now() + 10 * 60 * 1000,
                reason: 'quota_exhausted',
              },
            },
          },
          null,
          2
        ),
        'utf8'
      );
      process.env.CCS_HOME = tempHome;

      const ccsDir = path.join(tempHome, '.ccs');
      mkdirSync(path.join(ccsDir, 'cache'), { recursive: true });
      writeFileSync(
        path.join(ccsDir, 'config.yaml'),
        'version: 1\nwebsearch:\n  enabled: true\n  providers:\n    exa:\n      enabled: true\n      max_results: 5\n    tavily:\n      enabled: false\n      max_results: 5\n    brave:\n      enabled: false\n      max_results: 5\n    searxng:\n      enabled: false\n      url: ""\n      max_results: 5\n    duckduckgo:\n      enabled: false\n      max_results: 5\n    gemini:\n      enabled: false\n    grok:\n      enabled: false\n    opencode:\n      enabled: false\n',
        'utf8'
      );

      process.env.EXA_API_KEY = 'test-key';

      try {
        const providers = getWebSearchCliProviders();
        const exa = providers.find((provider) => provider.id === 'exa');

        expect(exa?.enabled).toBe(true);
        expect(exa?.available).toBe(false);
        expect(exa?.detail).toContain('Cooling down');
        expect(exa?.detail).toContain('quota exhaustion');

        const readiness = buildWebSearchReadiness(true, providers);
        expect(readiness.readiness).toBe('needs_setup');
        expect(readiness.message).toContain('Cooling down');
      } finally {
        delete process.env.EXA_API_KEY;

        if (originalCcsHome === undefined) {
          delete process.env.CCS_HOME;
        } else {
          process.env.CCS_HOME = originalCcsHome;
        }
        rmSync(tempHome, { recursive: true, force: true });
      }
    }
  );
});
