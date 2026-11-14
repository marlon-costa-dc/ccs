/**
 * Composite Variant Fallback Tests
 *
 * Tests fallback detection and application for composite variants
 */

import { describe, it, expect } from 'bun:test';
import { isProviderError, detectFailedTier, PROVIDER_ERROR_PATTERNS } from '../retry-handler';
import { applyFallback } from '../env-resolver';
import { CompositeTierConfig } from '../../../config/unified-config-types';

// ========================================
// isProviderError
// ========================================

describe('isProviderError', () => {
  it('should return false for exit code 0 (success)', () => {
    const result = isProviderError(0, 'Error: 500 Internal Server Error');
    expect(result).toBe(false);
  });

  it('should detect 4xx error codes', () => {
    const stderr = 'Error: 401 Unauthorized';
    const result = isProviderError(1, stderr);
    expect(result).toBe(true);
  });

  it('should detect 5xx error codes', () => {
    const stderr = 'Error: 503 Service Unavailable';
    const result = isProviderError(1, stderr);
    expect(result).toBe(true);
  });

  it('should detect overloaded errors', () => {
    const stderr = 'Provider is currently overloaded. Please try again later.';
    const result = isProviderError(1, stderr);
    expect(result).toBe(true);
  });

  it('should detect quota exceeded errors', () => {
    const stderr = 'quota has been exceeded for this account';
    const result = isProviderError(1, stderr);
    expect(result).toBe(true);
  });

  it('should detect connection refused errors', () => {
    const stderr = 'ECONNREFUSED 127.0.0.1:8317';
    const result = isProviderError(1, stderr);
    expect(result).toBe(true);
  });

  it('should detect rate limit errors', () => {
    const stderr = 'Rate limit exceeded. Please slow down.';
    const result = isProviderError(1, stderr);
    expect(result).toBe(true);
  });

  it('should return false for normal user exit', () => {
    const stderr = 'User cancelled the operation';
    const result = isProviderError(1, stderr);
    expect(result).toBe(false);
  });

  it('should return false for empty stderr with non-zero exit', () => {
    const result = isProviderError(1, '');
    expect(result).toBe(false);
  });

  it('should be case insensitive for error patterns', () => {
    const stderr = 'ERROR: OVERLOADED';
    const result = isProviderError(1, stderr);
    expect(result).toBe(true);
  });

  it('should handle multiple error patterns in same stderr', () => {
    const stderr = 'Error: 429 rate limit exceeded';
    const result = isProviderError(1, stderr);
    expect(result).toBe(true);
  });
});

// ========================================
// detectFailedTier
// ========================================

describe('detectFailedTier', () => {
  const tiers: {
    opus: CompositeTierConfig;
    sonnet: CompositeTierConfig;
    haiku: CompositeTierConfig;
  } = {
    opus: { provider: 'agy', model: 'claude-opus-4-6-thinking' },
    sonnet: { provider: 'gemini', model: 'gemini-3-pro-preview' },
    haiku: { provider: 'codex', model: 'gpt-4o-mini' },
  };

  it('should detect opus tier from model name in stderr', () => {
    const stderr = 'Error calling model claude-opus-4-6-thinking: 503 overloaded';
    const result = detectFailedTier(stderr, tiers);
    expect(result).toBe('opus');
  });

  it('should detect sonnet tier from model name in stderr', () => {
    const stderr = 'Failed to connect: gemini-3-pro-preview returned 500';
    const result = detectFailedTier(stderr, tiers);
    expect(result).toBe('sonnet');
  });

  it('should detect haiku tier from model name in stderr', () => {
    const stderr = 'gpt-4o-mini: rate limit exceeded';
    const result = detectFailedTier(stderr, tiers);
    expect(result).toBe('haiku');
  });

  it('should return null when no tier model found in stderr', () => {
    const stderr = 'Generic error with no model mention';
    const result = detectFailedTier(stderr, tiers);
    expect(result).toBe(null);
  });

  it('should return null for empty stderr', () => {
    const result = detectFailedTier('', tiers);
    expect(result).toBe(null);
  });

  it('should match first tier when multiple models mentioned', () => {
    const stderr = 'Tried claude-opus-4-6-thinking, then gemini-3-pro-preview, both failed';
    const result = detectFailedTier(stderr, tiers);
    expect(result).toBe('opus'); // First match
  });

  it('should handle model names with suffixes (thinking budgets)', () => {
    const tiersWithBudget: typeof tiers = {
      opus: { provider: 'agy', model: 'claude-opus-4-6-thinking(high)' },
      sonnet: { provider: 'gemini', model: 'gemini-3-pro-preview(medium)' },
      haiku: { provider: 'codex', model: 'gpt-4o-mini' },
    };

    // Stderr might not include suffix
    const stderr = 'Error with claude-opus-4-6-thinking: timeout';
    const result = detectFailedTier(stderr, tiersWithBudget);
    // Should still match because model name is substring
    expect(result).toBe('opus');
  });

  it('should strip complex thinking suffix with comma-separated params', () => {
    const tiersWithComplexBudget: typeof tiers = {
      opus: { provider: 'agy', model: 'claude-opus-4-6-thinking(32768,extended)' },
      sonnet: { provider: 'agy', model: 'claude-sonnet-4-5-thinking(high)' },
      haiku: { provider: 'agy', model: 'claude-3-5-haiku' },
    };

    // Stderr contains base model name without suffix
    const stderr = 'Error: claude-opus-4-6-thinking overloaded';
    const result = detectFailedTier(stderr, tiersWithComplexBudget);
    // Should match because regex strips (32768,extended) to get base name
    expect(result).toBe('opus');
  });
});

// ========================================
// applyFallback
// ========================================

describe('applyFallback', () => {
  it('should update opus tier env var', () => {
    const env = {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8318',
      ANTHROPIC_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const result = applyFallback(env, 'opus', {
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
    });

    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gemini-3-pro-preview');
    // Should not modify other tiers
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking');
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('should update sonnet tier env var', () => {
    const env = {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8318',
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const result = applyFallback(env, 'sonnet', {
      provider: 'codex',
      model: 'gpt-4o',
    });

    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-4o');
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('should update haiku tier env var', () => {
    const env = {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8318',
      ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const result = applyFallback(env, 'haiku', {
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
    });

    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gemini-3-flash-preview');
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking');
  });

  it('should update ANTHROPIC_MODEL when failed tier is default tier', () => {
    const env = {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8318',
      ANTHROPIC_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const result = applyFallback(env, 'opus', {
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
    });

    // Both tier model and default model should be updated
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gemini-3-pro-preview');
    expect(result.ANTHROPIC_MODEL).toBe('gemini-3-pro-preview');
  });

  it('should NOT update ANTHROPIC_MODEL when failed tier is not default tier', () => {
    const env = {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8318',
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking', // Sonnet is default
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const result = applyFallback(env, 'opus', {
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
    });

    // Opus tier should be updated but ANTHROPIC_MODEL should remain sonnet
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gemini-3-pro-preview');
    expect(result.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5-thinking');
  });

  it('should preserve other env vars', () => {
    const env = {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8318',
      ANTHROPIC_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
      CUSTOM_VAR: 'custom_value',
      ANOTHER_VAR: '12345',
    };

    const result = applyFallback(env, 'opus', {
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
    });

    expect(result.CUSTOM_VAR).toBe('custom_value');
    expect(result.ANOTHER_VAR).toBe('12345');
    expect(result.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8318');
  });

  it('should not mutate original env object', () => {
    const env = {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8318',
      ANTHROPIC_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const original = { ...env };
    applyFallback(env, 'opus', {
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
    });

    // Original env should be unchanged
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe(original.ANTHROPIC_DEFAULT_OPUS_MODEL);
  });
});

// ========================================
// PROVIDER_ERROR_PATTERNS
// ========================================

describe('PROVIDER_ERROR_PATTERNS', () => {
  it('should export error pattern regexes', () => {
    expect(PROVIDER_ERROR_PATTERNS).toBeDefined();
    expect(Array.isArray(PROVIDER_ERROR_PATTERNS)).toBe(true);
    expect(PROVIDER_ERROR_PATTERNS.length).toBeGreaterThan(0);
  });

  it('should match 4xx errors', () => {
    const pattern = PROVIDER_ERROR_PATTERNS.find((p) => p.test('Error: 401'));
    expect(pattern).toBeDefined();
  });

  it('should match 5xx errors', () => {
    const pattern = PROVIDER_ERROR_PATTERNS.find((p) => p.test('Error: 503'));
    expect(pattern).toBeDefined();
  });

  it('should match overloaded keyword', () => {
    const pattern = PROVIDER_ERROR_PATTERNS.find((p) => p.test('overloaded'));
    expect(pattern).toBeDefined();
  });

  it('should match quota exceeded', () => {
    const pattern = PROVIDER_ERROR_PATTERNS.find((p) => p.test('quota exceeded'));
    expect(pattern).toBeDefined();
  });

  it('should match ECONNREFUSED', () => {
    const pattern = PROVIDER_ERROR_PATTERNS.find((p) => p.test('ECONNREFUSED'));
    expect(pattern).toBeDefined();
  });

  it('should match rate limit', () => {
    const pattern = PROVIDER_ERROR_PATTERNS.find((p) => p.test('rate limit'));
    expect(pattern).toBeDefined();
  });
});
