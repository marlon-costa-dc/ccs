/**
 * Synthetic test credentials.
 *
 * PURPOSE: generate clearly-non-functional, obviously-synthetic API keys so
 * that no test file ever inlines a real-looking secret (e.g. `sk-ant-...`).
 * None of the strings returned here can authenticate against a live service.
 * Each value embeds the literal marker `SYNTHETIC` so it is trivially
 * distinguishable from any production credential.
 *
 * DO NOT use these for anything that requires a genuine token.
 */

const SYNTHETIC_MARKER = 'SYNTHETIC-TEST-KEY';

function seed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function syntheticSeed(): string {
  return seed();
}

export function fakeApiKey(label = 'key', tokenSeed = seed()): string {
  return `${SYNTHETIC_MARKER}-${label}-${tokenSeed}-not-a-real-secret`;
}

export function fakeAnthropicKey(tokenSeed = seed()): string {
  // NOTE: the `sk-ant-` prefix is a structural signal the runtime requires —
  // `isAnthropicDirectProfile()` (src/web-server/routes/route-helpers.ts)
  // detects native Anthropic mode via `apiKey.startsWith('sk-ant-')`. The rest
  // of the value is unmistakably synthetic and can never authenticate.
  return `sk-ant-api03-SYNTHETIC-${tokenSeed}-not-a-real-key`;
}

export function fakeExaKey(tokenSeed = seed()): string {
  return `${SYNTHETIC_MARKER}-exa-${tokenSeed}-exa-secret-placeholder`;
}

export function fakeOpenApiKey(tokenSeed = seed()): string {
  return `${SYNTHETIC_MARKER}-openai-${tokenSeed}-sk-placeholder`;
}
