import { DEFAULT_COPILOT_CONFIG, type CopilotConfig } from '../config/unified-config-types';

const LEGACY_COPILOT_MODEL_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
  // copilot-api v0.7.0 no longer advertises this ID in /v1/models and rejects it at runtime.
  'raptor-mini': DEFAULT_COPILOT_CONFIG.model,
});

export const DEPRECATED_COPILOT_MODEL_IDS = Object.freeze(
  Object.keys(LEGACY_COPILOT_MODEL_FALLBACKS)
);

export type CopilotNormalizationSource = 'config' | 'settings';
export type CopilotNormalizationTier = 'default' | 'opus' | 'sonnet' | 'haiku';

export interface CopilotNormalizationWarning {
  source: CopilotNormalizationSource;
  tier: CopilotNormalizationTier;
  original: string;
  replacement: string;
  message: string;
}

export interface CopilotSettingsPayload {
  env?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NormalizedCopilotConfigResult {
  config: CopilotConfig;
  warnings: CopilotNormalizationWarning[];
}

export interface NormalizedCopilotSettingsResult {
  settings: CopilotSettingsPayload;
  effectiveConfig: CopilotConfig;
  warnings: CopilotNormalizationWarning[];
}

function trimModelId(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getTierLabel(tier: CopilotNormalizationTier): string {
  switch (tier) {
    case 'default':
      return 'default';
    case 'opus':
      return 'Opus';
    case 'sonnet':
      return 'Sonnet';
    case 'haiku':
      return 'Haiku';
  }
}

function createWarning(
  source: CopilotNormalizationSource,
  tier: CopilotNormalizationTier,
  original: string,
  replacement: string
): CopilotNormalizationWarning {
  return {
    source,
    tier,
    original,
    replacement,
    message: `Copilot ${getTierLabel(tier)} model '${original}' is no longer supported. CCS will use '${replacement}' instead.`,
  };
}

function appendWarning(
  warnings: CopilotNormalizationWarning[],
  warning?: CopilotNormalizationWarning
): void {
  if (!warning) return;
  const key = `${warning.source}:${warning.tier}:${warning.original.toLowerCase()}:${warning.replacement.toLowerCase()}`;
  if (
    warnings.some(
      (entry) =>
        `${entry.source}:${entry.tier}:${entry.original.toLowerCase()}:${entry.replacement.toLowerCase()}` ===
        key
    )
  ) {
    return;
  }
  warnings.push(warning);
}

function normalizeRequiredModelSelection(
  model: string | null | undefined,
  fallbackModel: string,
  source: CopilotNormalizationSource,
  tier: CopilotNormalizationTier
): { value: string; warning?: CopilotNormalizationWarning } {
  const normalizedFallback = trimModelId(fallbackModel) ?? DEFAULT_COPILOT_CONFIG.model;
  const trimmedModel = trimModelId(model) ?? normalizedFallback;
  const replacement = LEGACY_COPILOT_MODEL_FALLBACKS[trimmedModel.toLowerCase()];
  if (!replacement) return { value: trimmedModel };
  return {
    value: replacement,
    warning: createWarning(source, tier, trimmedModel, replacement),
  };
}

function normalizeOptionalModelSelection(
  model: string | null | undefined,
  fallbackModel: string,
  source: CopilotNormalizationSource,
  tier: CopilotNormalizationTier
): { value?: string; warning?: CopilotNormalizationWarning } {
  const trimmedModel = trimModelId(model);
  if (!trimmedModel) return { value: undefined };
  if (!LEGACY_COPILOT_MODEL_FALLBACKS[trimmedModel.toLowerCase()]) {
    return { value: trimmedModel };
  }
  const replacement = trimModelId(fallbackModel) ?? DEFAULT_COPILOT_CONFIG.model;
  return {
    value: replacement,
    warning: createWarning(source, tier, trimmedModel, replacement),
  };
}

function getSettingsEnv(settings: CopilotSettingsPayload): Record<string, unknown> {
  return settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
    ? settings.env
    : {};
}

function getSettingsPayload(settings: CopilotSettingsPayload): CopilotSettingsPayload {
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
}

export function normalizeCopilotModelId(
  model: string | null | undefined,
  fallbackModel: string = DEFAULT_COPILOT_CONFIG.model
): string {
  return normalizeRequiredModelSelection(model, fallbackModel, 'config', 'default').value;
}

export function normalizeCopilotConfigWithWarnings(
  config: CopilotConfig
): NormalizedCopilotConfigResult {
  const warnings: CopilotNormalizationWarning[] = [];
  const baseModel = normalizeRequiredModelSelection(
    config.model,
    DEFAULT_COPILOT_CONFIG.model,
    'config',
    'default'
  );
  appendWarning(warnings, baseModel.warning);

  const opusModel = normalizeOptionalModelSelection(
    config.opus_model,
    baseModel.value,
    'config',
    'opus'
  );
  const sonnetModel = normalizeOptionalModelSelection(
    config.sonnet_model,
    baseModel.value,
    'config',
    'sonnet'
  );
  const haikuModel = normalizeOptionalModelSelection(
    config.haiku_model,
    baseModel.value,
    'config',
    'haiku'
  );
  appendWarning(warnings, opusModel.warning);
  appendWarning(warnings, sonnetModel.warning);
  appendWarning(warnings, haikuModel.warning);

  return {
    config: {
      ...config,
      model: baseModel.value,
      opus_model: opusModel.value,
      sonnet_model: sonnetModel.value,
      haiku_model: haikuModel.value,
    },
    warnings,
  };
}

export function normalizeCopilotConfig(config: CopilotConfig): CopilotConfig {
  return normalizeCopilotConfigWithWarnings(config).config;
}

export function normalizeCopilotSettingsWithWarnings(
  settings: CopilotSettingsPayload,
  fallbackConfig: CopilotConfig = DEFAULT_COPILOT_CONFIG
): NormalizedCopilotSettingsResult {
  const configResult = normalizeCopilotConfigWithWarnings(fallbackConfig);
  const warnings = [...configResult.warnings];
  const payload = getSettingsPayload(settings);
  const rawEnv = getSettingsEnv(payload);

  const baseModel = normalizeRequiredModelSelection(
    typeof rawEnv.ANTHROPIC_MODEL === 'string' ? rawEnv.ANTHROPIC_MODEL : configResult.config.model,
    configResult.config.model,
    'settings',
    'default'
  );
  appendWarning(warnings, baseModel.warning);

  const opusModel = normalizeOptionalModelSelection(
    typeof rawEnv.ANTHROPIC_DEFAULT_OPUS_MODEL === 'string'
      ? rawEnv.ANTHROPIC_DEFAULT_OPUS_MODEL
      : configResult.config.opus_model,
    baseModel.value,
    'settings',
    'opus'
  );
  const sonnetModel = normalizeOptionalModelSelection(
    typeof rawEnv.ANTHROPIC_DEFAULT_SONNET_MODEL === 'string'
      ? rawEnv.ANTHROPIC_DEFAULT_SONNET_MODEL
      : configResult.config.sonnet_model,
    baseModel.value,
    'settings',
    'sonnet'
  );
  const rawHaikuModel =
    typeof rawEnv.ANTHROPIC_SMALL_FAST_MODEL === 'string'
      ? rawEnv.ANTHROPIC_SMALL_FAST_MODEL
      : typeof rawEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'string'
        ? rawEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL
        : configResult.config.haiku_model;
  const haikuModel = normalizeOptionalModelSelection(
    rawHaikuModel,
    baseModel.value,
    'settings',
    'haiku'
  );
  appendWarning(warnings, opusModel.warning);
  appendWarning(warnings, sonnetModel.warning);
  appendWarning(warnings, haikuModel.warning);

  const effectiveConfig = {
    ...configResult.config,
    model: baseModel.value,
    opus_model: opusModel.value ?? baseModel.value,
    sonnet_model: sonnetModel.value ?? baseModel.value,
    haiku_model: haikuModel.value ?? baseModel.value,
  };

  return {
    settings: {
      ...payload,
      env: {
        ...rawEnv,
        ANTHROPIC_MODEL: effectiveConfig.model,
        ANTHROPIC_DEFAULT_OPUS_MODEL: effectiveConfig.opus_model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: effectiveConfig.sonnet_model,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: effectiveConfig.haiku_model,
        ANTHROPIC_SMALL_FAST_MODEL: effectiveConfig.haiku_model,
      },
    },
    effectiveConfig,
    warnings,
  };
}

export function normalizeCopilotSettings(
  settings: CopilotSettingsPayload,
  fallbackConfig: CopilotConfig = DEFAULT_COPILOT_CONFIG
): CopilotSettingsPayload {
  return normalizeCopilotSettingsWithWarnings(settings, fallbackConfig).settings;
}
