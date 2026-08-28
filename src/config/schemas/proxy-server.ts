/**
 * Proxy server, global env, continuity, and image analysis types and defaults.
 *
 * Covers:
 * - CliproxyServerConfig: remote/local CLIProxy server mode
 * - OpenAICompatProxyConfig: OpenAI-compatible local proxy
 * - GlobalEnvConfig: global environment variable injection
 * - ContinuityConfig: cross-profile continuity inheritance
 * - ImageAnalysisConfig: vision analysis via CLIProxy
 */

/**
 * Remote proxy configuration.
 * Connect to a remote CLIProxyAPI instance instead of spawning local binary.
 */
export interface ProxyRemoteConfig {
  /** Enable remote proxy mode (default: false = local mode) */
  enabled: boolean;
  /** Remote proxy hostname or IP (empty = not configured) */
  host: string;
  /**
   * Remote proxy port.
   * Optional - defaults based on protocol:
   * - HTTPS: 443
   * - HTTP: 8317
   * When empty/undefined, uses protocol default.
   */
  port?: number;
  /** Protocol for remote connection */
  protocol: 'http' | 'https';
  /** Auth token for remote proxy API endpoints (optional, sent as header) */
  auth_token: string;
  /**
   * Management key for remote proxy management API endpoints.
   * CLIProxyAPI uses separate authentication for management endpoints
   * (/v0/management/*) via 'secret-key' config.
   */
  management_key?: string;
  /** Connection timeout in milliseconds (default: 2000) */
  timeout?: number;
  /** Explicit TLS policy for self-signed remote certificates. */
  allow_self_signed: boolean;
  /** Enable auto-sync profiles to remote on settings change (default: false) */
  auto_sync?: boolean;
}

/**
 * Local proxy configuration.
 */
export interface ProxyLocalConfig {
  /** Local proxy port (default: 8317) */
  port: number;
  /** Auto-start local binary (default: true) */
  auto_start: boolean;
}

export interface OpenAICompatProxyRoutingConfig {
  default?: string;
  background?: string;
  think?: string;
  longContext?: string;
  webSearch?: string;
  longContextThreshold?: number;
}

export interface OpenAICompatProxyConfig {
  /** Default local port for OpenAI-compatible proxy instances */
  port?: number;
  /** Optional profile-scoped local port overrides */
  profile_ports?: Record<string, number>;
  routing?: OpenAICompatProxyRoutingConfig;
}

/**
 * CLIProxy server configuration section.
 * Controls whether CCS uses local or remote CLIProxyAPI instance.
 */
export interface CliproxyServerConfig {
  /** Required deadline for CCS-owned CLIProxy management calls. */
  management_timeout_ms: number;
  /** Remote proxy settings */
  remote: ProxyRemoteConfig;
  /** Local proxy settings */
  local: ProxyLocalConfig;
}

/**
 * Global environment variables configuration.
 * These env vars are injected into ALL non-Claude subscription profiles.
 * Useful for disabling telemetry, bug commands, error reporting, etc.
 */
export interface GlobalEnvConfig {
  /** Enable global env injection (default: true) */
  enabled: boolean;
  /** Environment variables to inject */
  env: Record<string, string>;
}

/**
 * Cross-profile continuity inheritance configuration.
 * Maps execution profile names to source account profiles for CLAUDE_CONFIG_DIR reuse.
 */
export interface ContinuityConfig {
  /** Profile name -> source account profile name */
  inherit_from_account?: Record<string, string>;
}

/**
 * Default global env vars for third-party profiles.
 * These disable Claude Code telemetry/reporting since we're using proxy.
 */
export const DEFAULT_GLOBAL_ENV: Record<string, string> = {
  DISABLE_BUG_COMMAND: '1',
  DISABLE_ERROR_REPORTING: '1',
  DISABLE_TELEMETRY: '1',
};

/**
 * Default CLIProxy server configuration.
 * Local mode by default - remote must be explicitly enabled.
 * Port is optional for remote - defaults based on protocol.
 */
export const DEFAULT_CLIPROXY_SERVER_CONFIG: CliproxyServerConfig = {
  management_timeout_ms: 5_000,
  remote: {
    enabled: false,
    host: '',
    protocol: 'http',
    auth_token: '',
    allow_self_signed: false,
  },
  local: {
    port: 8317,
    auto_start: true,
  },
};

export interface CliproxyServerOverrides {
  readonly management_timeout_ms?: number;
  readonly remote?: Partial<ProxyRemoteConfig>;
  readonly local?: Partial<ProxyLocalConfig>;
}

export function withCliproxyServerDefaults(
  overrides: CliproxyServerOverrides = {}
): CliproxyServerConfig {
  const remote = overrides.remote;
  const local = overrides.local;
  return {
    management_timeout_ms:
      overrides.management_timeout_ms ?? DEFAULT_CLIPROXY_SERVER_CONFIG.management_timeout_ms,
    remote: {
      enabled: remote?.enabled ?? DEFAULT_CLIPROXY_SERVER_CONFIG.remote.enabled,
      host: remote?.host ?? DEFAULT_CLIPROXY_SERVER_CONFIG.remote.host,
      port: remote?.port,
      protocol: remote?.protocol ?? DEFAULT_CLIPROXY_SERVER_CONFIG.remote.protocol,
      auth_token: remote?.auth_token ?? DEFAULT_CLIPROXY_SERVER_CONFIG.remote.auth_token,
      management_key: remote?.management_key,
      timeout: remote?.timeout,
      allow_self_signed:
        remote?.allow_self_signed ?? DEFAULT_CLIPROXY_SERVER_CONFIG.remote.allow_self_signed,
      auto_sync: remote?.auto_sync,
    },
    local: {
      port: local?.port ?? DEFAULT_CLIPROXY_SERVER_CONFIG.local.port,
      auto_start: local?.auto_start ?? DEFAULT_CLIPROXY_SERVER_CONFIG.local.auto_start,
    },
  };
}

export const DEFAULT_OPENAI_COMPAT_PROXY_CONFIG: OpenAICompatProxyConfig = {
  profile_ports: {},
  routing: {
    longContextThreshold: 60_000,
  },
};

/**
 * Image analysis configuration.
 * Routes image/PDF files through CLIProxy for vision analysis.
 */
export interface ImageAnalysisConfig {
  /** Enable image analysis via CLIProxy (default: true) */
  enabled: boolean;
  /** Timeout in seconds (default: 60) */
  timeout: number;
  /** Provider-to-model mapping for vision analysis */
  provider_models: Record<string, string>;
  /** Fallback backend used when a profile does not resolve to a provider-specific backend */
  fallback_backend?: string;
  /** Explicit profile-name-to-backend overrides for settings/custom aliases */
  profile_backends?: Record<string, string>;
}

/**
 * Default image analysis configuration.
 * Enabled by default for CLIProxy providers with vision support.
 */
export const DEFAULT_IMAGE_ANALYSIS_CONFIG: ImageAnalysisConfig = {
  enabled: true,
  timeout: 60,
  provider_models: {
    agy: 'gemini-3-1-flash-preview',
    gemini: 'gemini-3-flash-preview',
    codex: 'gpt-5.1-codex-mini',
    kiro: 'kiro-claude-haiku-4-5',
    ghcp: 'claude-haiku-4.5',
    claude: 'claude-haiku-4-5-20251001',
    qwen: 'vision-model',
    iflow: 'qwen3-vl-plus',
    kimi: 'vision-model',
  },
  fallback_backend: 'gemini',
  profile_backends: {},
};
