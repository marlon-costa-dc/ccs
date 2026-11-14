/**
 * CLIProxy Executor - Backwards Compatibility Shim
 *
 * This file re-exports from the modular executor/ structure.
 * All implementation has been moved to:
 * - executor/index.ts - Main orchestrator
 * - executor/lifecycle-manager.ts - Spawn/kill/poll operations
 * - executor/env-resolver.ts - Environment variable resolution
 * - executor/retry-handler.ts - Error recovery and retry logic
 * - executor/session-bridge.ts - Session tracking integration
 *
 * @deprecated Import from './executor' instead
 */
// Re-export from modular structure
export { execClaudeWithCLIProxy, isPortAvailable, findAvailablePort } from '.';

export { default } from '.';
