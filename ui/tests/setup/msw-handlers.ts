/**
 * MSW Handlers
 * Mock Service Worker handlers for API mocking in tests
 */

import { http, HttpResponse } from 'msw';

// Mock data
export const mockWebSearchConfig = {
  enabled: true,
  providers: {
    gemini: { enabled: true, model: 'gemini-2.5-flash', timeout: 30000 },
    grok: { enabled: false, model: 'grok-beta', timeout: 30000 },
    opencode: { enabled: true, model: 'opencode/grok-code', timeout: 30000 },
  },
};

export const mockWebSearchStatus = {
  geminiCli: { installed: true, path: '/usr/local/bin/gemini', version: '1.0.0' },
  grokCli: { installed: false, path: null, version: null },
  opencodeCli: { installed: true, path: '/usr/local/bin/opencode', version: '2.0.0' },
  readiness: { status: 'ready' as const, message: 'WebSearch ready' },
};

export const mockGlobalEnvConfig = {
  enabled: true,
  env: {
    NODE_ENV: 'development',
    DEBUG: 'true',
  },
};

export const mockProxyConfig = {
  remote: {
    enabled: true,
    host: 'proxy.example.com',
    port: 8080,
    protocol: 'https' as const,
    authToken: 'test-token',
  },
  fallback: {
    enabled: false,
    host: '',
    port: 0,
    protocol: 'http' as const,
  },
  local: {
    enabled: true,
    port: 3001,
  },
};

export const mockUsageSummary = {
  totalTokens: 1500000,
  totalInputTokens: 500000,
  totalOutputTokens: 1000000,
  totalCacheTokens: 200000,
  totalCacheCreationTokens: 50000,
  totalCacheReadTokens: 150000,
  totalCost: 15.5,
  tokenBreakdown: {
    input: { tokens: 500000, cost: 5.0 },
    output: { tokens: 1000000, cost: 10.0 },
    cacheCreation: { tokens: 50000, cost: 0.25 },
    cacheRead: { tokens: 150000, cost: 0.25 },
  },
  totalDays: 30,
  averageTokensPerDay: 50000,
  averageCostPerDay: 0.52,
};

export const mockAuthStatus = {
  authStatus: [
    {
      provider: 'google',
      displayName: 'Google',
      accounts: [
        {
          id: 'acc-1',
          email: 'user1@gmail.com',
          isDefault: true,
          lastUsedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'acc-2',
          email: 'user2@gmail.com',
          isDefault: false,
          lastUsedAt: '2025-01-02T00:00:00Z',
        },
      ],
    },
    {
      provider: 'github',
      displayName: 'GitHub',
      accounts: [
        {
          id: 'acc-3',
          email: 'dev@github.com',
          isDefault: true,
          lastUsedAt: '2025-01-03T00:00:00Z',
        },
      ],
    },
  ],
};

export const mockCliproxyStats = {
  accountStats: {
    'user1@gmail.com': { successCount: 95, failureCount: 5, lastUsedAt: '2025-01-01T12:00:00Z' },
    'user2@gmail.com': { successCount: 45, failureCount: 15, lastUsedAt: '2025-01-02T12:00:00Z' },
    'dev@github.com': { successCount: 100, failureCount: 0, lastUsedAt: '2025-01-03T12:00:00Z' },
  },
};

// API Handlers
export const handlers = [
  // WebSearch endpoints
  http.get('/api/websearch', () => {
    return HttpResponse.json(mockWebSearchConfig);
  }),

  http.get('/api/websearch/status', () => {
    return HttpResponse.json(mockWebSearchStatus);
  }),

  http.put('/api/websearch', async ({ request }) => {
    const body = (await request.json()) as typeof mockWebSearchConfig;
    return HttpResponse.json({ websearch: body });
  }),

  // GlobalEnv endpoints
  http.get('/api/global-env', () => {
    return HttpResponse.json(mockGlobalEnvConfig);
  }),

  http.put('/api/global-env', async ({ request }) => {
    const body = (await request.json()) as typeof mockGlobalEnvConfig;
    return HttpResponse.json({ config: body });
  }),

  // Proxy endpoints
  http.get('/api/cliproxy-server', () => {
    return HttpResponse.json({ data: mockProxyConfig });
  }),

  http.put('/api/cliproxy-server', async ({ request }) => {
    const body = (await request.json()) as Partial<typeof mockProxyConfig>;
    return HttpResponse.json({ data: { ...mockProxyConfig, ...body } });
  }),

  http.post('/api/cliproxy-server/test', () => {
    return HttpResponse.json({
      data: {
        connected: true,
        version: '1.0.0',
        latency: 50,
      },
    });
  }),

  // Usage/Analytics endpoints
  http.get('/api/usage/summary', () => {
    return HttpResponse.json({ data: mockUsageSummary });
  }),

  http.get('/api/usage/daily', () => {
    return HttpResponse.json({
      data: [
        {
          date: '2025-01-01',
          tokens: 50000,
          inputTokens: 20000,
          outputTokens: 30000,
          cacheTokens: 5000,
          cost: 0.5,
          modelsUsed: 2,
        },
        {
          date: '2025-01-02',
          tokens: 60000,
          inputTokens: 25000,
          outputTokens: 35000,
          cacheTokens: 6000,
          cost: 0.6,
          modelsUsed: 3,
        },
      ],
    });
  }),

  http.get('/api/usage/hourly', () => {
    return HttpResponse.json({
      data: [
        {
          hour: '00:00',
          tokens: 5000,
          inputTokens: 2000,
          outputTokens: 3000,
          cacheTokens: 500,
          cost: 0.05,
          modelsUsed: 1,
          requests: 10,
        },
      ],
    });
  }),

  http.get('/api/usage/models', () => {
    return HttpResponse.json({
      data: [
        {
          model: 'claude-3-opus',
          tokens: 100000,
          inputTokens: 40000,
          outputTokens: 60000,
          cacheCreationTokens: 5000,
          cacheReadTokens: 10000,
          cacheTokens: 15000,
          cost: 5.0,
          percentage: 60,
          costBreakdown: {
            input: { tokens: 40000, cost: 2.0 },
            output: { tokens: 60000, cost: 3.0 },
            cacheCreation: { tokens: 5000, cost: 0.025 },
            cacheRead: { tokens: 10000, cost: 0.025 },
          },
          ioRatio: 1.5,
        },
      ],
    });
  }),

  http.get('/api/usage/sessions', () => {
    return HttpResponse.json({
      data: {
        sessions: [
          {
            sessionId: 'sess-1',
            projectPath: '/home/user/project',
            inputTokens: 10000,
            outputTokens: 20000,
            cost: 0.3,
            lastActivity: '2025-01-01T12:00:00Z',
            modelsUsed: ['claude-3-opus'],
          },
        ],
        total: 1,
        limit: 3,
        offset: 0,
        hasMore: false,
      },
    });
  }),

  http.get('/api/usage/status', () => {
    return HttpResponse.json({ data: { lastFetch: Date.now(), cacheSize: 1024 } });
  }),

  http.post('/api/usage/refresh', () => {
    return HttpResponse.json({ success: true });
  }),

  // CLIProxy auth endpoints
  http.get('/api/cliproxy/auth', () => {
    return HttpResponse.json({ data: mockAuthStatus });
  }),

  http.get('/api/cliproxy-stats', () => {
    return HttpResponse.json({ data: mockCliproxyStats });
  }),
];
