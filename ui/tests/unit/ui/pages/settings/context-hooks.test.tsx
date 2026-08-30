/**
 * Settings Context Hooks Tests
 * Unit tests for useSettingsContext and useSettingsActions
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useSettingsContext,
  useSettingsActions,
} from '../../../../../src/pages/settings/hooks/context-hooks';
import { SettingsTestProviders } from '../../../../setup/test-utils';
import type { ReactNode } from 'react';

// Wrapper for hooks that require SettingsContext
function wrapper({ children }: { children: ReactNode }) {
  return <SettingsTestProviders>{children}</SettingsTestProviders>;
}

describe('useSettingsContext', () => {
  it('throws error when used outside SettingsProvider', () => {
    // Suppress console.error for expected error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useSettingsContext());
    }).toThrow('useSettingsContext must be used within a SettingsProvider');

    consoleSpy.mockRestore();
  });

  it('returns context when used within SettingsProvider', () => {
    const { result } = renderHook(() => useSettingsContext(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.state).toBeDefined();
    expect(result.current.dispatch).toBeDefined();
    expect(typeof result.current.dispatch).toBe('function');
  });

  it('provides initial state', () => {
    const { result } = renderHook(() => useSettingsContext(), { wrapper });

    expect(result.current.state.webSearchConfig).toBeNull();
    expect(result.current.state.webSearchLoading).toBe(true);
    expect(result.current.state.globalEnvConfig).toBeNull();
    expect(result.current.state.proxyConfig).toBeNull();
  });
});

describe('useSettingsActions', () => {
  it('returns all action functions', () => {
    const { result } = renderHook(() => useSettingsActions(), { wrapper });

    // WebSearch actions
    expect(typeof result.current.setWebSearchConfig).toBe('function');
    expect(typeof result.current.setWebSearchStatus).toBe('function');
    expect(typeof result.current.setWebSearchLoading).toBe('function');
    expect(typeof result.current.setWebSearchStatusLoading).toBe('function');
    expect(typeof result.current.setWebSearchSaving).toBe('function');
    expect(typeof result.current.setWebSearchError).toBe('function');
    expect(typeof result.current.setWebSearchSuccess).toBe('function');

    // GlobalEnv actions
    expect(typeof result.current.setGlobalEnvConfig).toBe('function');
    expect(typeof result.current.setGlobalEnvLoading).toBe('function');
    expect(typeof result.current.setGlobalEnvSaving).toBe('function');
    expect(typeof result.current.setGlobalEnvError).toBe('function');
    expect(typeof result.current.setGlobalEnvSuccess).toBe('function');

    // Proxy actions
    expect(typeof result.current.setProxyConfig).toBe('function');
    expect(typeof result.current.setProxyLoading).toBe('function');
    expect(typeof result.current.setProxySaving).toBe('function');
    expect(typeof result.current.setProxyError).toBe('function');
    expect(typeof result.current.setProxySuccess).toBe('function');
    expect(typeof result.current.setProxyTestResult).toBe('function');
    expect(typeof result.current.setProxyTesting).toBe('function');

    // Raw config actions
    expect(typeof result.current.setRawConfig).toBe('function');
    expect(typeof result.current.setRawConfigLoading).toBe('function');
  });

  describe('WebSearch actions', () => {
    it('setWebSearchConfig updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      const config = { enabled: true, providers: { gemini: { enabled: true } } };

      act(() => {
        result.current.actions.setWebSearchConfig(config);
      });

      expect(result.current.context.state.webSearchConfig).toEqual(config);
    });

    it('setWebSearchStatus updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      const status = {
        geminiCli: { installed: true, path: '/bin', version: '1.0' },
        grokCli: { installed: false, path: null, version: null },
        opencodeCli: { installed: false, path: null, version: null },
        readiness: { status: 'ready' as const, message: 'Ready' },
      };

      act(() => {
        result.current.actions.setWebSearchStatus(status);
      });

      expect(result.current.context.state.webSearchStatus).toEqual(status);
    });

    it('setWebSearchLoading updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setWebSearchLoading(false);
      });

      expect(result.current.context.state.webSearchLoading).toBe(false);
    });

    it('setWebSearchStatusLoading updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setWebSearchStatusLoading(false);
      });

      expect(result.current.context.state.webSearchStatusLoading).toBe(false);
    });

    it('setWebSearchSaving updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setWebSearchSaving(true);
      });

      expect(result.current.context.state.webSearchSaving).toBe(true);
    });

    it('setWebSearchError updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setWebSearchError('Test error');
      });

      expect(result.current.context.state.webSearchError).toBe('Test error');
    });

    it('setWebSearchSuccess updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setWebSearchSuccess(true);
      });

      expect(result.current.context.state.webSearchSuccess).toBe(true);
    });
  });

  describe('GlobalEnv actions', () => {
    it('setGlobalEnvConfig updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      const config = { enabled: true, env: { NODE_ENV: 'test' } };

      act(() => {
        result.current.actions.setGlobalEnvConfig(config);
      });

      expect(result.current.context.state.globalEnvConfig).toEqual(config);
    });

    it('setGlobalEnvLoading updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setGlobalEnvLoading(false);
      });

      expect(result.current.context.state.globalEnvLoading).toBe(false);
    });

    it('setGlobalEnvSaving updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setGlobalEnvSaving(true);
      });

      expect(result.current.context.state.globalEnvSaving).toBe(true);
    });

    it('setGlobalEnvError updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setGlobalEnvError('GlobalEnv error');
      });

      expect(result.current.context.state.globalEnvError).toBe('GlobalEnv error');
    });

    it('setGlobalEnvSuccess updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setGlobalEnvSuccess(true);
      });

      expect(result.current.context.state.globalEnvSuccess).toBe(true);
    });
  });

  describe('Proxy actions', () => {
    it('setProxyConfig updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      const config = {
        remote: {
          enabled: true,
          host: 'test.com',
          port: 8080,
          protocol: 'https' as const,
          authToken: '',
        },
        fallback: { enabled: false, host: '', port: 0, protocol: 'http' as const },
        local: { enabled: true, port: 3001 },
      };

      act(() => {
        result.current.actions.setProxyConfig(config);
      });

      expect(result.current.context.state.proxyConfig).toEqual(config);
    });

    it('setProxyLoading updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setProxyLoading(false);
      });

      expect(result.current.context.state.proxyLoading).toBe(false);
    });

    it('setProxySaving updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setProxySaving(true);
      });

      expect(result.current.context.state.proxySaving).toBe(true);
    });

    it('setProxyError updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setProxyError('Proxy connection error');
      });

      expect(result.current.context.state.proxyError).toBe('Proxy connection error');
    });

    it('setProxySuccess updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setProxySuccess(true);
      });

      expect(result.current.context.state.proxySuccess).toBe(true);
    });

    it('setProxyTesting updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setProxyTesting(true);
      });

      expect(result.current.context.state.proxyTesting).toBe(true);
    });

    it('setProxyTestResult updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      const testResult = { connected: true, version: '1.0.0', latency: 25 };

      act(() => {
        result.current.actions.setProxyTestResult(testResult);
      });

      expect(result.current.context.state.proxyTestResult).toEqual(testResult);
    });
  });

  describe('Raw config actions', () => {
    it('setRawConfig updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setRawConfig('{"key": "value"}');
      });

      expect(result.current.context.state.rawConfig).toBe('{"key": "value"}');
    });

    it('setRawConfigLoading updates state', () => {
      const { result } = renderHook(
        () => {
          const context = useSettingsContext();
          const actions = useSettingsActions();
          return { context, actions };
        },
        { wrapper }
      );

      act(() => {
        result.current.actions.setRawConfigLoading(true);
      });

      expect(result.current.context.state.rawConfigLoading).toBe(true);
    });
  });

  describe('action stability', () => {
    it('action functions are stable across renders', () => {
      const { result, rerender } = renderHook(() => useSettingsActions(), { wrapper });

      const firstRenderActions = result.current;
      rerender();
      const secondRenderActions = result.current;

      // useCallback should return same function references
      expect(firstRenderActions.setWebSearchConfig).toBe(secondRenderActions.setWebSearchConfig);
      expect(firstRenderActions.setGlobalEnvConfig).toBe(secondRenderActions.setGlobalEnvConfig);
      expect(firstRenderActions.setProxyConfig).toBe(secondRenderActions.setProxyConfig);
    });
  });
});
