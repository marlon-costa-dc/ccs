/**
 * Copilot Module Index
 *
 * Central exports for GitHub Copilot integration via copilot-api.
 */

// Types
export * from './types';

// Package Manager (self-managed installation)
export {
  getCopilotDir,
  getCopilotApiBinPath,
  isCopilotApiInstalled,
  getInstalledVersion,
  getPinnedVersion,
  savePinnedVersion,
  clearPinnedVersion,
  checkForUpdates,
  ensureCopilotApi,
  installCopilotApiVersion,
  uninstallCopilotApi,
  getCopilotApiInfo,
} from './copilot-package-manager';

// Auth
export {
  checkAuthStatus,
  startAuthFlow,
  getCopilotDebugInfo,
  hasTokenFile,
  getTokenPath,
} from './copilot-auth';
export type { AuthFlowResult } from './copilot-auth';

// Daemon
export { isDaemonRunning, getDaemonStatus, startDaemon, stopDaemon } from './copilot-daemon';

// Models
export {
  DEFAULT_COPILOT_MODELS,
  fetchModelsFromDaemon,
  getAvailableModels,
  getDefaultModel,
} from './copilot-models';

// Normalization
export {
  DEPRECATED_COPILOT_MODEL_IDS,
  normalizeCopilotConfig,
  normalizeCopilotConfigWithWarnings,
  normalizeCopilotModelId,
  normalizeCopilotSettings,
  normalizeCopilotSettingsWithWarnings,
} from './copilot-model-normalizer';

// Usage
export {
  normalizeCopilotUsage,
  fetchCopilotUsageFromDaemon,
  getCopilotUsage,
} from './copilot-usage';

// Executor
export { getCopilotStatus, generateCopilotEnv, executeCopilotProfile } from './copilot-executor';
