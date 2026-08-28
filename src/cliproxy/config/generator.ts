/**
 * Core config generation for CLIProxyAPI
 * Handles unified config.yaml generation for all providers
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CLIProxyBackend, CLIProxyProvider, ProviderConfig } from '../types';
import { getProviderDisplayName } from '../provider-capabilities';
import { getModelMappingFromConfig } from '../config/base-config-loader';
import { AI_PROVIDER_FAMILY_IDS } from '../ai-providers/types';

import { getAuthDir, getProviderAuthDir, getConfigPathForPort } from './path-resolver';
import { CLIPROXY_DEFAULT_PORT } from './port-manager';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import { getActiveDockerLegacyApiKeys } from '../../docker/docker-key-rotation';
import type { CLIProxyOAuthModelAliasConfig } from '../../config/schemas/cliproxy';
import { mergeOAuthModelAliases, serializeOAuthModelAliasBody } from './oauth-model-alias-config';
import {
  mergePayloadConfig,
  parsePayloadSection,
  serializePayloadSection,
} from './payload-rule-config';
import { serializeModelRoutingSection } from './model-routing-projector';
import type { UnifiedConfig } from '../../config/unified-config-types';
import { ConfigError } from '../../errors/error-types';

/** Internal API key for CCS-managed requests */
export const CCS_INTERNAL_API_KEY = 'ccs-internal-managed';

/** Simple secret key for Control Panel login (user-facing) */
export const CCS_CONTROL_PANEL_SECRET = 'ccs';

/**
 * Config version - bump when config format changes to trigger regeneration
 * v1: Initial config (port, auth-dir, api-keys only)
 * v2: Full-featured config with dashboard, quota mgmt, simplified key
 * v3: Logging disabled by default (user opt-in via ~/.ccs/config.yaml)
 * v4: Added Kiro (AWS) and GitHub Copilot providers
 * v5: Added disable-cooling: true for stability
 * v6: Added oauth-model-alias with Opus 4.6 support
 * v7: Added fork:true for Claude model aliases (keep both upstream and alias names)
 * v8: Added Gemini 3.1 preview aliases for provider routing compatibility
 * v9: Added resilient alias compatibility expansion and cache-assisted alias enrichment
 * v10: Migrated deprecated gemini-claude-* aliases to upstream claude-* aliases
 * v11: Migrated deprecated claude-sonnet-4-6-thinking aliases to claude-sonnet-4-6
 * v12: Removed denylisted Antigravity Claude 4.5 aliases
 * v13: Removed aggressive Gemini alias expansion to reduce model list noise in Control Panel
 * v14: Added Gemini 3.1 Flash Antigravity aliases for upcoming rollout compatibility
 * v15: Prune stale generated Antigravity Gemini preview aliases during regeneration
 * v16: Narrow stale Gemini alias cleanup to broad multi-version guessed ranges
 * v17: Persist routing.strategy from CCS unified config
 * v18: Persist routing.session-affinity and routing.session-affinity-ttl from CCS unified config
 * v19: Persist backend-aware management panel repository from CCS unified config
 * v20: Pool-gated cooling/routing/retry-cap block; disable-cooling flips to false for pool users
 * v21: Persist user-defined OAuth aliases and scoped payload override rules
 * v22: Project source-attributed model prices from the unified AI Hub catalog
 * v23: Replace the legacy price list with the canonical model-routing projection
 * v24: Remove generated compatibility aliases; only explicit CCS aliases remain
 */
export const CLIPROXY_CONFIG_VERSION = 24;

export const ORIGINAL_MANAGEMENT_PANEL_REPOSITORY =
  'https://github.com/router-for-me/Cli-Proxy-API-Management-Center';
export const PLUS_MANAGEMENT_PANEL_REPOSITORY =
  'https://github.com/marlon-costa-dc/Cli-Proxy-API-Management-Center';

interface RegenerateConfigOptions {
  configPath?: string;
  authDir?: string;
}

interface PreservedYamlSection {
  key: string;
  body: string;
}

/**
 * Get provider configuration
 * Model mappings are loaded from config/base-{provider}.settings.json
 */
export function getProviderConfig(provider: CLIProxyProvider): ProviderConfig {
  // Load models from base config file
  const models = getModelMappingFromConfig(provider);

  return {
    name: provider,
    displayName: getProviderDisplayName(provider),
    models,
    requiresOAuth: true, // All CLIProxy providers require OAuth
  };
}

/**
 * Get CLIProxy logging settings from user config.
 * Defaults to disabled to prevent disk bloat.
 */
function getLoggingSettings(config: UnifiedConfig): {
  loggingToFile: boolean;
  requestLog: boolean;
} {
  return {
    loggingToFile: config.cliproxy.logging?.enabled ?? false,
    requestLog: config.cliproxy.logging?.request_log ?? false,
  };
}

function normalizeManagementPanelRepository(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getDefaultManagementPanelRepository(backend: CLIProxyBackend | undefined): string {
  return backend === 'plus'
    ? PLUS_MANAGEMENT_PANEL_REPOSITORY
    : ORIGINAL_MANAGEMENT_PANEL_REPOSITORY;
}

export function getManagementPanelRepository(
  config: UnifiedConfig = loadOrCreateUnifiedConfig()
): string {
  return (
    normalizeManagementPanelRepository(config.cliproxy?.management_panel_repository) ??
    getDefaultManagementPanelRepository(config.cliproxy?.backend)
  );
}

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function sanitizeYamlScalar(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseManagementPanelRepository(content: string): string | null {
  const match = content.match(/^\s*panel-github-repository:\s*(.+?)\s*$/m);
  return match ? sanitizeYamlScalar(match[1]) : null;
}

function getConfigVersionFromContent(content: string): number | null {
  const versionMatch = content.match(/CCS v(\d+)/);
  if (!versionMatch) {
    return null;
  }

  const parsedVersion = Number.parseInt(versionMatch[1], 10);
  return Number.isNaN(parsedVersion) ? null : parsedVersion;
}

/**
 * Generate oauth-model-alias YAML section.
 * Only explicit CCS configuration may create aliases. Runtime model-pipeline
 * aliases are projected separately from the immutable snapshot.
 */
function generateOAuthModelAliasSection(configuredAliases?: CLIProxyOAuthModelAliasConfig): string {
  const normalizedConfiguredAliases = mergeOAuthModelAliases({}, configuredAliases ?? {});
  const body = serializeOAuthModelAliasBody(normalizedConfiguredAliases);
  return body ? `oauth-model-alias:\n${body}` : '';
}

/**
 * Generate UNIFIED config.yaml content for ALL providers
 * This enables concurrent usage of gemini/codex/agy without config conflicts.
 * CLIProxyAPI routes requests by model name to the appropriate provider.
 *
 * @param port - Server port (default: 8317)
 * @param userApiKeys - User-added API keys to preserve (default: [])
 * @param existingPayload - Existing payload content to merge with structured CCS rules
 */
function generateUnifiedConfigContent(
  port: number = CLIPROXY_DEFAULT_PORT,
  userApiKeys: string[] = [],
  existingPayload?: string,
  unifiedConfig: UnifiedConfig = loadOrCreateUnifiedConfig()
): string {
  const authDir = getAuthDir(); // Base auth dir - CLIProxyAPI scans subdirectories
  // Convert Windows backslashes to forward slashes for YAML compatibility
  const authDirNormalized = authDir.split(path.sep).join('/');

  // Get logging settings from user config (disabled by default)
  const { loggingToFile, requestLog } = getLoggingSettings(unifiedConfig);
  const managementPanelRepository = getManagementPanelRepository(unifiedConfig);
  const userRoutingConfig = unifiedConfig.cliproxy;
  const payloadSection = serializePayloadSection(
    mergePayloadConfig(parsePayloadSection(existingPayload ?? ''), userRoutingConfig.payload)
  );

  // Get effective auth tokens (respects user customization)
  const effectiveApiKey = unifiedConfig.cliproxy.auth?.api_key ?? CCS_INTERNAL_API_KEY;
  const effectiveSecret =
    unifiedConfig.cliproxy.auth?.management_secret ?? CCS_CONTROL_PANEL_SECRET;

  // Build api-keys section with internal key + preserved user keys.
  // Docker upgrades may temporarily keep the historical default key as a
  // compatibility grace key; the marker file controls when that is active.
  const allApiKeys = Array.from(
    new Set([effectiveApiKey, ...getActiveDockerLegacyApiKeys(), ...userApiKeys])
  );
  const apiKeysYaml = allApiKeys.map((key) => `  - "${key}"`).join('\n');

  const usesModelPipeline = unifiedConfig.model_pipeline !== undefined;
  const reliabilitySection = usesModelPipeline
    ? '# Failure behavior, aliases and direct routes are owned exclusively by model-routing below.'
    : '';
  const oauthAliasSection = usesModelPipeline
    ? ''
    : generateOAuthModelAliasSection(userRoutingConfig.oauth_model_alias);

  // Unified config with enhanced CLIProxyAPI features
  const config = `# CLIProxyAPI config generated by CCS v${CLIPROXY_CONFIG_VERSION}
# Supports: gemini, codex, xai, agy, qwen, iflow, and other registered providers (concurrent usage)
# Generated: ${new Date().toISOString()}
#
# This config is auto-managed by CCS. Manual edits may be overwritten.
# Use 'ccs doctor' to regenerate with latest settings.

# =============================================================================
# Server Settings
# =============================================================================

port: ${port}
debug: false

# =============================================================================
# Logging
# =============================================================================
# WARNING: Logs can grow to several GB if enabled!
# To enable logging, edit ~/.ccs/config.yaml:
#   cliproxy:
#     logging:
#       enabled: true
#       request_log: true
# Then run 'ccs doctor --fix' to regenerate this config.
# Use 'ccs cleanup' to remove old logs.

# Write logs to file (stored in ~/.ccs/cliproxy/logs/)
logging-to-file: ${loggingToFile}

# Log individual API requests for debugging/analytics
request-log: ${requestLog}

# =============================================================================
# Dashboard & Management
# =============================================================================

# Enable usage statistics for CCS dashboard analytics
usage-statistics-enabled: true

# Remote management API for CCS dashboard integration
remote-management:
  allow-remote: true
  secret-key: "${effectiveSecret}"
  disable-control-panel: false
  panel-github-repository: ${quoteYamlString(managementPanelRepository)}

# =============================================================================
# Reliability & Quota Management
# =============================================================================

${reliabilitySection}

# =============================================================================
# Authentication
# =============================================================================

# API keys for CCS and user-added external requests
# NOTE: User-added keys are preserved across CCS updates (fix for issue #200)
api-keys:
${apiKeysYaml}

# OAuth tokens directory (auto-discovered by CLIProxyAPI)
auth-dir: "${authDirNormalized}"
${oauthAliasSection}
${payloadSection ? `${payloadSection}\n` : ''}
${unifiedConfig.model_pipeline ? serializeModelRoutingSection(unifiedConfig.model_pipeline.snapshot) : ''}
`;

  return config;
}

/**
 * Render a complete CLIProxy config from one already-resolved CCS config and
 * the exact active CLIProxy document. CCS preserves only registered provider
 * families; model-routing and every other generated section come from the
 * incoming canonical snapshot and resolved CCS settings.
 */
export function renderUnifiedConfigForPublication(
  unifiedConfig: UnifiedConfig,
  port: number,
  activeConfigYaml: string
): string {
  if (!unifiedConfig.model_pipeline) {
    throw new ConfigError('model_pipeline is required for canonical CLIProxy publication');
  }
  if (!activeConfigYaml.trim()) {
    throw new ConfigError('active CLIProxy config.yaml is required for canonical publication');
  }
  const generated = generateUnifiedConfigContent(port, [], undefined, unifiedConfig);
  return appendSections(generated, extractProviderSections(activeConfigYaml));
}

/**
 * Generate unified config.yaml file (supports all providers concurrently)
 * Only regenerates if config doesn't exist.
 * @returns Path to config file
 */
export function generateConfig(
  provider: CLIProxyProvider,
  port: number = CLIPROXY_DEFAULT_PORT
): string {
  const configPath = getConfigPathForPort(port);

  // Ensure provider auth directory exists
  const authDir = getProviderAuthDir(provider);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });

  // Only generate config if it doesn't exist (unified config serves all providers)
  if (!fs.existsSync(configPath)) {
    const configContent = generateUnifiedConfigContent(port);
    fs.writeFileSync(configPath, configContent, { mode: 0o600 });
  }

  return configPath;
}

/**
 * Parse user-added API keys from existing config content.
 * Extracts all keys except the internal CCS key for preservation.
 *
 * @param content - Existing config.yaml content
 * @returns Array of user-added API keys (excludes CCS_INTERNAL_API_KEY)
 */
export function parseUserApiKeys(content: string): string[] {
  const userKeys: string[] = [];

  // Find the api-keys section by looking for lines starting with "  - " after "api-keys:"
  // Normalize line endings first
  const normalizedContent = content.replace(/\r\n/g, '\n');

  // Find the api-keys: line and extract all subsequent key entries
  const lines = normalizedContent.split('\n');
  let inApiKeysSection = false;

  for (const line of lines) {
    // Check if this is the start of api-keys section
    if (line.match(/^api-keys:\s*$/)) {
      inApiKeysSection = true;
      continue;
    }

    // If we're in the api-keys section, look for key entries
    if (inApiKeysSection) {
      // Key entries are indented with "  - " or similar
      const keyMatch = line.match(/^\s+-\s*"([^"]*)"/);
      if (keyMatch) {
        const key = keyMatch[1];
        // Exclude the internal CCS key and empty strings
        if (key && key !== CCS_INTERNAL_API_KEY) {
          userKeys.push(key);
        }
      } else if (line.match(/^\S/) && line.trim().length > 0) {
        // Non-indented line that's not empty means we've left the api-keys section
        break;
      }
      // Continue for blank lines or other indented content
    }
  }

  return userKeys;
}

/**
 * Extract a YAML section from config content by key name.
 * Returns the raw lines (including indented children) or empty string.
 */
function extractYamlSection(content: string, sectionKey: string): string {
  const lines = content.split('\n');
  const sectionLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.startsWith(`${sectionKey}:`)) {
      inSection = true;
      continue; // Skip the key line itself
    }
    if (inSection) {
      // Section ends at next top-level key (skip comments and blank lines)
      if (line.match(/^\S/) && !line.startsWith('#') && line.trim().length > 0) {
        break;
      }
      sectionLines.push(line);
    }
  }

  // Strip leading/trailing blank lines but preserve indentation
  return sectionLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

function extractProviderSections(content: string): PreservedYamlSection[] {
  const sections: PreservedYamlSection[] = [];
  for (const familyId of AI_PROVIDER_FAMILY_IDS) {
    const body = extractYamlSection(content, familyId);
    if (body) {
      sections.push({ key: familyId, body });
    }
  }
  return sections;
}

function appendSections(content: string, sections: readonly PreservedYamlSection[]): string {
  let nextContent = content;
  for (const section of sections) {
    nextContent += `${section.key}:\n${section.body}\n`;
  }
  return nextContent;
}

/**
 * Force regenerate config.yaml with latest settings.
 * Preserves user-added API keys, claude-api-key section, and port settings.
 *
 * @param port - Default port to use if not found in existing config
 * @returns Path to new config file
 */
export function regenerateConfig(
  port: number = CLIPROXY_DEFAULT_PORT,
  options?: RegenerateConfigOptions
): string {
  const configPath = options?.configPath ?? getConfigPathForPort(port);
  const authDir = options?.authDir ?? getAuthDir();

  // Preserve user settings from existing config
  let effectivePort = port;
  let userApiKeys: string[] = [];
  let existingPayload = '';
  const preservedSections: PreservedYamlSection[] = [];

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');

    // Preserve port setting
    const portMatch = content.match(/^port:\s*(\d+)/m);
    if (portMatch) {
      effectivePort = parseInt(portMatch[1], 10);
    }

    // Preserve user-added API keys (fix for issue #200)
    userApiKeys = parseUserApiKeys(content);

    // Preserve AI provider sections managed outside the generated defaults.
    preservedSections.push(...extractProviderSections(content));

    // The payload section is user-owned and must survive regeneration; the
    // generator merges it with the structured CCS rules further down.
    existingPayload = extractYamlSection(content, 'payload');
  }

  // Ensure directories exist
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });

  // Generate fresh config with preserved user API keys and structured settings.
  let configContent = generateUnifiedConfigContent(effectivePort, userApiKeys, existingPayload);

  // Re-append managed top-level sections that are not part of the generated defaults.
  configContent = appendSections(configContent, preservedSections);

  const candidatePath = `${configPath}.ccs-candidate-${process.pid}`;
  try {
    fs.writeFileSync(candidatePath, configContent, { mode: 0o600, flag: 'wx' });
    fs.renameSync(candidatePath, configPath);
  } catch (error) {
    if (fs.existsSync(candidatePath)) fs.unlinkSync(candidatePath);
    throw error;
  }

  return configPath;
}

/**
 * Check if config needs regeneration (version mismatch)
 * @returns true if config should be regenerated
 */
export function configNeedsRegeneration(port: number = CLIPROXY_DEFAULT_PORT): boolean {
  const configPath = getConfigPathForPort(port);
  if (!fs.existsSync(configPath)) {
    return false; // Will be created on first use
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');

    // Check for version marker
    const configVersion = getConfigVersionFromContent(content);
    if (configVersion === null) {
      return true; // No version marker = old config
    }
    if (configVersion < CLIPROXY_CONFIG_VERSION) {
      return true;
    }

    return parseManagementPanelRepository(content) !== getManagementPanelRepository();
  } catch {
    return true; // Error reading = regenerate
  }
}

/**
 * Check if config exists for port
 */
export function configExists(port: number = CLIPROXY_DEFAULT_PORT): boolean {
  return fs.existsSync(getConfigPathForPort(port));
}

/**
 * Delete config file for specific port
 */
export function deleteConfigForPort(port: number): void {
  const configPath = getConfigPathForPort(port);
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

/**
 * Delete config file (default port)
 */
export function deleteConfig(): void {
  deleteConfigForPort(CLIPROXY_DEFAULT_PORT);
}
