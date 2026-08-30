/**
 * Settings Context Tests
 * Unit tests for settingsReducer and initial state
 */

import { describe, it, expect } from 'vitest';
import {
  settingsReducer,
  initialSettingsState,
  type SettingsState,
  type SettingsAction,
} from '../../../../../src/pages/settings/settings-context';

describe('settingsReducer', () => {
  describe('initial state', () => {
    it('has correct default values', () => {
      expect(initialSettingsState.webSearchConfig).toBeNull();
      expect(initialSettingsState.webSearchStatus).toBeNull();
      expect(initialSettingsState.webSearchLoading).toBe(true);
      expect(initialSettingsState.webSearchStatusLoading).toBe(true);
      expect(initialSettingsState.webSearchSaving).toBe(false);
      expect(initialSettingsState.webSearchError).toBeNull();
      expect(initialSettingsState.webSearchSuccess).toBe(false);

      expect(initialSettingsState.globalEnvConfig).toBeNull();
      expect(initialSettingsState.globalEnvLoading).toBe(true);
      expect(initialSettingsState.globalEnvSaving).toBe(false);
      expect(initialSettingsState.globalEnvError).toBeNull();
      expect(initialSettingsState.globalEnvSuccess).toBe(false);

      expect(initialSettingsState.proxyConfig).toBeNull();
      expect(initialSettingsState.proxyLoading).toBe(true);
      expect(initialSettingsState.proxySaving).toBe(false);
      expect(initialSettingsState.proxyError).toBeNull();
      expect(initialSettingsState.proxySuccess).toBe(false);
      expect(initialSettingsState.proxyTestResult).toBeNull();
      expect(initialSettingsState.proxyTesting).toBe(false);

      expect(initialSettingsState.rawConfig).toBeNull();
      expect(initialSettingsState.rawConfigLoading).toBe(false);
    });
  });

  describe('WebSearch actions', () => {
    it('SET_WEBSEARCH_CONFIG updates webSearchConfig', () => {
      const config = { enabled: true, providers: { gemini: { enabled: true } } };
      const action: SettingsAction = { type: 'SET_WEBSEARCH_CONFIG', payload: config };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.webSearchConfig).toEqual(config);
    });

    it('SET_WEBSEARCH_STATUS updates webSearchStatus', () => {
      const status = {
        geminiCli: { installed: true, path: '/bin', version: '1.0' },
        grokCli: { installed: false, path: null, version: null },
        opencodeCli: { installed: false, path: null, version: null },
        readiness: { status: 'ready' as const, message: 'Ready' },
      };
      const action: SettingsAction = { type: 'SET_WEBSEARCH_STATUS', payload: status };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.webSearchStatus).toEqual(status);
    });

    it('SET_WEBSEARCH_LOADING updates webSearchLoading', () => {
      const action: SettingsAction = { type: 'SET_WEBSEARCH_LOADING', payload: false };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.webSearchLoading).toBe(false);
    });

    it('SET_WEBSEARCH_STATUS_LOADING updates webSearchStatusLoading', () => {
      const action: SettingsAction = { type: 'SET_WEBSEARCH_STATUS_LOADING', payload: false };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.webSearchStatusLoading).toBe(false);
    });

    it('SET_WEBSEARCH_SAVING updates webSearchSaving', () => {
      const action: SettingsAction = { type: 'SET_WEBSEARCH_SAVING', payload: true };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.webSearchSaving).toBe(true);
    });

    it('SET_WEBSEARCH_ERROR updates webSearchError', () => {
      const action: SettingsAction = { type: 'SET_WEBSEARCH_ERROR', payload: 'Network error' };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.webSearchError).toBe('Network error');
    });

    it('SET_WEBSEARCH_SUCCESS updates webSearchSuccess', () => {
      const action: SettingsAction = { type: 'SET_WEBSEARCH_SUCCESS', payload: true };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.webSearchSuccess).toBe(true);
    });
  });

  describe('GlobalEnv actions', () => {
    it('SET_GLOBALENV_CONFIG updates globalEnvConfig', () => {
      const config = { enabled: true, env: { NODE_ENV: 'test' } };
      const action: SettingsAction = { type: 'SET_GLOBALENV_CONFIG', payload: config };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.globalEnvConfig).toEqual(config);
    });

    it('SET_GLOBALENV_LOADING updates globalEnvLoading', () => {
      const action: SettingsAction = { type: 'SET_GLOBALENV_LOADING', payload: false };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.globalEnvLoading).toBe(false);
    });

    it('SET_GLOBALENV_SAVING updates globalEnvSaving', () => {
      const action: SettingsAction = { type: 'SET_GLOBALENV_SAVING', payload: true };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.globalEnvSaving).toBe(true);
    });

    it('SET_GLOBALENV_ERROR updates globalEnvError', () => {
      const action: SettingsAction = { type: 'SET_GLOBALENV_ERROR', payload: 'Save failed' };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.globalEnvError).toBe('Save failed');
    });

    it('SET_GLOBALENV_SUCCESS updates globalEnvSuccess', () => {
      const action: SettingsAction = { type: 'SET_GLOBALENV_SUCCESS', payload: true };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.globalEnvSuccess).toBe(true);
    });
  });

  describe('Proxy actions', () => {
    it('SET_PROXY_CONFIG updates proxyConfig', () => {
      const config = {
        remote: {
          enabled: true,
          host: 'proxy.test',
          port: 8080,
          protocol: 'https' as const,
          authToken: '',
        },
        fallback: { enabled: false, host: '', port: 0, protocol: 'http' as const },
        local: { enabled: true, port: 3001 },
      };
      const action: SettingsAction = { type: 'SET_PROXY_CONFIG', payload: config };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.proxyConfig).toEqual(config);
    });

    it('SET_PROXY_LOADING updates proxyLoading', () => {
      const action: SettingsAction = { type: 'SET_PROXY_LOADING', payload: false };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.proxyLoading).toBe(false);
    });

    it('SET_PROXY_SAVING updates proxySaving', () => {
      const action: SettingsAction = { type: 'SET_PROXY_SAVING', payload: true };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.proxySaving).toBe(true);
    });

    it('SET_PROXY_ERROR updates proxyError', () => {
      const action: SettingsAction = { type: 'SET_PROXY_ERROR', payload: 'Connection failed' };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.proxyError).toBe('Connection failed');
    });

    it('SET_PROXY_SUCCESS updates proxySuccess', () => {
      const action: SettingsAction = { type: 'SET_PROXY_SUCCESS', payload: true };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.proxySuccess).toBe(true);
    });

    it('SET_PROXY_TEST_RESULT updates proxyTestResult', () => {
      const result = { connected: true, version: '1.0.0', latency: 50 };
      const action: SettingsAction = { type: 'SET_PROXY_TEST_RESULT', payload: result };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.proxyTestResult).toEqual(result);
    });

    it('SET_PROXY_TESTING updates proxyTesting', () => {
      const action: SettingsAction = { type: 'SET_PROXY_TESTING', payload: true };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.proxyTesting).toBe(true);
    });
  });

  describe('Raw config actions', () => {
    it('SET_RAW_CONFIG updates rawConfig', () => {
      const action: SettingsAction = { type: 'SET_RAW_CONFIG', payload: '{"test": true}' };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.rawConfig).toBe('{"test": true}');
    });

    it('SET_RAW_CONFIG_LOADING updates rawConfigLoading', () => {
      const action: SettingsAction = { type: 'SET_RAW_CONFIG_LOADING', payload: true };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState.rawConfigLoading).toBe(true);
    });
  });

  describe('immutability', () => {
    it('returns new state object without mutating original', () => {
      const action: SettingsAction = { type: 'SET_WEBSEARCH_LOADING', payload: false };
      const newState = settingsReducer(initialSettingsState, action);
      expect(newState).not.toBe(initialSettingsState);
      expect(initialSettingsState.webSearchLoading).toBe(true);
    });
  });

  describe('unknown action handling', () => {
    it('returns current state for unknown actions', () => {
      const state: SettingsState = { ...initialSettingsState, webSearchLoading: false };
      // @ts-expect-error Testing unknown action type
      const newState = settingsReducer(state, { type: 'UNKNOWN_ACTION', payload: {} });
      expect(newState).toBe(state);
    });
  });
});
