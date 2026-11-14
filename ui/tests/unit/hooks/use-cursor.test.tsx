import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AllProviders } from '../../setup/test-utils';
import { useCursor } from '@/hooks/use-cursor';

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const wrapper = ({ children }: { children: ReactNode }) => <AllProviders>{children}</AllProviders>;

describe('useCursor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preserves structured probe failures and refreshes live status queries', async () => {
    const probeFailure = {
      ok: false,
      stage: 'daemon',
      status: 503,
      duration_ms: 321,
      error_type: 'daemon_not_running',
      message: 'Cursor daemon is not running.',
    };

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/legacy/cursor/status')) {
        return Promise.resolve(
          createJsonResponse({
            enabled: true,
            authenticated: true,
            auth_method: 'manual',
            token_age: 1,
            token_expired: false,
            daemon_running: false,
            port: 20129,
            auto_start: false,
            ghost_mode: true,
          })
        );
      }

      if (url.endsWith('/api/legacy/cursor/settings')) {
        return Promise.resolve(
          createJsonResponse({
            enabled: true,
            port: 20129,
            auto_start: false,
            ghost_mode: true,
            model: 'gpt-5.3-codex',
          })
        );
      }

      if (url.endsWith('/api/legacy/cursor/models')) {
        return Promise.resolve(
          createJsonResponse({
            models: [{ id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'openai' }],
            current: 'gpt-5.3-codex',
          })
        );
      }

      if (url.endsWith('/api/legacy/cursor/settings/raw')) {
        return Promise.resolve(
          createJsonResponse({
            settings: {},
            mtime: 100,
            path: '/tmp/cursor.settings.json',
            exists: true,
          })
        );
      }

      if (url.endsWith('/api/legacy/cursor/probe') && init?.method === 'POST') {
        return Promise.resolve(createJsonResponse(probeFailure, 503));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCursor(), { wrapper });

    await waitFor(() => expect(result.current.status?.enabled).toBe(true));
    await waitFor(() => expect(result.current.models.length).toBe(1));

    await act(async () => {
      const probeResult = await result.current.runProbeAsync();
      expect(probeResult).toMatchObject(probeFailure);
    });

    await waitFor(() => expect(result.current.probeResult).toMatchObject(probeFailure));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith('/api/legacy/cursor/status')
        ).length
      ).toBeGreaterThanOrEqual(2)
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith('/api/legacy/cursor/models')
        ).length
      ).toBeGreaterThanOrEqual(2)
    );
  });
});
