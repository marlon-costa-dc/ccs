/**
 * CLIProxy configuration types and defaults.
 *
 * Covers provider/variant/routing/safety/logging configuration
 * for the CLIProxy integration layer.
 */

import type { TargetType } from '../../targets/target-adapter';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { CLIPROXY_PROVIDER_IDS } from '../../cliproxy/provider-capabilities';
import type { OAuthAccounts, CLIProxyAuthConfig, TokenRefreshSettings } from './auth';

/**
 * Supported CLIProxy providers.
 * Derived from CLIPROXY_PROVIDER_IDS — single source of truth in provider-capabilities.ts.
 */
export { CLIPROXY_PROVIDER_IDS as CLIPROXY_SUPPORTED_PROVIDERS };

/**
 * CLIProxy variant configuration.
 * User-defined variants of built-in OAuth providers.
 *
 * Settings are stored in separate *.settings.json files (matching Claude's pattern)
 * to allow users to edit them directly without touching config.yaml.
 */
export interface CLIProxyVariantConfig {
  /** Base provider to use */
  provider: CLIProxyProvider;
  /** Account nickname (references oauth_accounts) */
  account?: string;
  /** Path to settings file (e.g., "~/.ccs/gemini-custom.settings.json") */
  settings?: string;
  /** Unique port for variant isolation (8318-8417) */
  port?: number;
  /** Per-variant auth override (optional) */
  auth?: CLIProxyAuthConfig;
  /** Target CLI to use for this variant (default: 'claude') */
  target?: TargetType;
}

/**
 * Per-tier provider+model mapping for composite variants.
 */
export interface CompositeTierConfig {
  /** Stable client-visible model alias owned by the control plane. */
  alias: string;
  /** Provider for this tier */
  provider: CLIProxyProvider;
  /** Model ID to use for this tier */
  model: string;
  /** Account nickname (optional, references oauth_accounts) */
  account?: string;
  /** Per-tier thinking budget override (e.g. 'xhigh', 'medium', 'off') */
  thinking?: string;
}

/**
 * Composite variant configuration.
 * Mixes different providers per Claude tier (opus, sonnet, haiku) in a single profile.
 * Uses CLIProxyAPI root endpoints (/v1/messages) for model-based routing
 * instead of provider-specific endpoints (/api/provider/{provider}).
 */
export interface CompositeVariantConfig {
  /** Discriminator for composite type */
  type: 'composite';
  /** Which tier ANTHROPIC_MODEL equals (default must be one of the three) */
  default_tier: 'opus' | 'sonnet' | 'haiku';
  /** Per-tier provider+model mapping */
  tiers: {
    opus: CompositeTierConfig;
    sonnet: CompositeTierConfig;
    haiku: CompositeTierConfig;
  };
  /** Path to settings file */
  settings?: string;
  /** Shared port for the composite profile */
  port?: number;
  /** Per-variant auth override (optional) */
  auth?: CLIProxyAuthConfig;
  /** Target CLI to use for this composite variant (default: 'claude') */
  target?: TargetType;
}

/**
 * CLIProxy logging configuration.
 * Controls whether CLIProxyAPI writes logs to disk.
 * Logs can grow to several GB if left enabled.
 */
export interface CLIProxyLoggingConfig {
  /** Enable logging to file (default: false to prevent disk bloat) */
  enabled?: boolean;
  /** Enable request logging for debugging (default: false) */
  request_log?: boolean;
}

/**
 * CLIProxy safety configuration.
 * Controls high-risk flow safeguards for supported providers.
 */
export interface CLIProxySafetyConfig {
  /** Allow skipping AGY responsibility checks and Gemini dashboard typed acknowledgement */
  antigravity_ack_bypass?: boolean;
}

/**
 * Default CLIProxy safety configuration.
 */
export const DEFAULT_CLIPROXY_SAFETY_CONFIG: CLIProxySafetyConfig = {
  antigravity_ack_bypass: false,
};

/** One OAuth model alias exposed by CLIProxy to compatible clients. */
export interface CLIProxyOAuthModelAliasEntry {
  /** Upstream model ID used after alias resolution. */
  name: string;
  /** Client-visible model ID accepted by CLIProxy. */
  alias: string;
  /** Keep both the upstream name and alias visible when supported upstream. */
  fork?: boolean;
}

/** Provider/protocol keyed OAuth model aliases (for example `codex`). */
export type CLIProxyOAuthModelAliasConfig = Record<string, CLIProxyOAuthModelAliasEntry[]>;

/** Model selector for a CLIProxy payload rule. */
export interface CLIProxyPayloadModelSelector {
  /** Client-visible model ID to match before OAuth alias resolution. */
  name: string;
  /** Optional protocol boundary, such as `codex`. */
  protocol?: string;
  /** Additional CLIProxy selector constraints retained across regeneration. */
  [constraint: string]: unknown;
}

/** A scoped CLIProxy payload override rule. */
export interface CLIProxyPayloadOverrideRule {
  /** All client model/protocol selectors covered by this rule. */
  models: CLIProxyPayloadModelSelector[];
  /** Upstream request parameters added when a selector matches. */
  params: Record<string, unknown>;
  /** Additional CLIProxy match constraints retained across regeneration. */
  [constraint: string]: unknown;
}

/**
 * User-owned CLIProxy payload configuration.
 *
 * Unknown supported payload subsections are retained so CCS regeneration does
 * not erase options introduced by newer CLIProxy releases.
 */
export interface CLIProxyPayloadConfig {
  override?: CLIProxyPayloadOverrideRule[];
  [section: string]: unknown;
}

/**
 * CLIProxy configuration section.
 */
export interface CLIProxyConfig {
  /** Backend selection: 'original' or 'plus' (default: 'original') */
  backend?: 'original' | 'plus';
  /** Optional CPAMC dashboard GitHub repository override for generated CLIProxy config */
  management_panel_repository?: string;
  /** Nickname to email mapping for OAuth accounts */
  oauth_accounts: OAuthAccounts;
  /** Built-in providers (read-only, for reference) */
  providers: readonly string[];
  /** User-defined provider variants (single-provider or composite) */
  variants: Record<string, CLIProxyVariantConfig | CompositeVariantConfig>;
  /** Logging configuration (disabled by default) */
  logging?: CLIProxyLoggingConfig;
  /** Safety controls for high-risk provider flows */
  safety?: CLIProxySafetyConfig;
  /** Kiro: disable incognito browser mode (use normal browser to save credentials) */
  kiro_no_incognito?: boolean;
  /** Global auth configuration for CLIProxyAPI */
  auth?: CLIProxyAuthConfig;
  /** Background token refresh worker settings */
  token_refresh?: TokenRefreshSettings;
  /** Auto-sync API profiles to local CLIProxy config on settings change (default: true) */
  auto_sync?: boolean;
  /** User-defined OAuth model aliases emitted into managed CLIProxy config. */
  oauth_model_alias?: CLIProxyOAuthModelAliasConfig;
  /** Scoped payload rules emitted into managed CLIProxy config. */
  payload?: CLIProxyPayloadConfig;
}
