import {
  AI_PROVIDER_FAMILY_DEFINITIONS,
  AI_PROVIDER_FAMILY_IDS,
  type AiProviderApiKeyEntry,
  type AiProviderEntryView,
  type AiProviderFamilyId,
  type AiProviderFamilyState,
  type AiProviderModelAlias,
  type ListAiProvidersResult,
  type OpenAICompatEntry,
  type OpenAICompatModelEntry,
  type UpsertAiProviderEntryInput,
} from './types';
import { getAiProvidersSourceSummary, readFamilyEntries, writeFamilyEntries } from './config-store';
import { ValidationError } from '../../errors/error-types';

function maskSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length > 8 ? `...${value.slice(-4)}` : '***';
}

function sanitizeUrlForView(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function restoreMaskedViewValue(
  value: string | undefined,
  existing: string | undefined,
  sanitizeForView: (value: string | undefined) => string | undefined = maskSecret
): string | undefined {
  const next = value?.trim() || undefined;
  if (!next || !existing) return next;
  return next === sanitizeForView(existing) ? existing : next;
}

function normalizeHeaders(
  headers: Array<{ key: string; value: string }> | undefined,
  existing?: Record<string, string>
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const normalized = headers.reduce<Record<string, string>>((acc, header) => {
    const key = header.key.trim();
    if (!key) return acc;
    acc[key] = restoreMaskedViewValue(header.value, existing?.[key]) || '';
    return acc;
  }, {});
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function toHeaderPairs(
  headers: Record<string, string> | undefined
): Array<{ key: string; value: string }> {
  return Object.entries(headers || {}).map(([key, value]) => ({
    key,
    value: maskSecret(value) || '***',
  }));
}

function readModelRulePart(model: unknown, key: string) {
  if (!model || typeof model !== 'object') {
    return '';
  }

  const value = (model as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readFirstModelRulePart(model: unknown, ...keys: string[]): string {
  for (const key of keys) {
    const value = readModelRulePart(model, key);
    if (value) return value;
  }
  return '';
}

function normalizeModelAliases(models: unknown): AiProviderModelAlias[] {
  return (Array.isArray(models) ? models : [])
    .map((model) => ({
      name: readModelRulePart(model, 'name'),
      alias: readModelRulePart(model, 'alias'),
    }))
    .filter((model) => model.name.length > 0 || model.alias.length > 0);
}

function readModelProtocols(model: unknown): string[] {
  if (!model || typeof model !== 'object') return [];
  const protocols = (model as Record<string, unknown>).protocols;
  return Array.isArray(protocols)
    ? protocols
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
    : [];
}

function normalizeOpenAICompatModels(models: unknown): AiProviderModelAlias[] {
  return (Array.isArray(models) ? models : [])
    .map((model) => ({
      name: readModelRulePart(model, 'name'),
      alias: readModelRulePart(model, 'alias'),
      catalogProviderId:
        readFirstModelRulePart(model, 'catalog-provider-id', 'catalogProviderId') || undefined,
      catalogModelId:
        readFirstModelRulePart(model, 'catalog-model-id', 'catalogModelId') || undefined,
      catalogRouteProviderId:
        readFirstModelRulePart(model, 'catalog-route-provider-id', 'catalogRouteProviderId') ||
        undefined,
      catalogRouteModelId:
        readFirstModelRulePart(model, 'catalog-route-model-id', 'catalogRouteModelId') || undefined,
      variantId: readFirstModelRulePart(model, 'variant-id', 'variantId') || undefined,
      protocols: readModelProtocols(model),
    }))
    .filter((model) => model.name.length > 0 || model.alias.length > 0);
}

function toOpenAICompatModelEntry(model: AiProviderModelAlias): OpenAICompatModelEntry {
  return {
    name: model.name.trim(),
    alias: model.alias.trim(),
    'catalog-provider-id': model.catalogProviderId?.trim() || undefined,
    'catalog-model-id': model.catalogModelId?.trim() || undefined,
    'catalog-route-provider-id': model.catalogRouteProviderId?.trim() || undefined,
    'catalog-route-model-id': model.catalogRouteModelId?.trim() || undefined,
    'variant-id': model.variantId?.trim() || undefined,
    protocols: model.protocols?.map((value) => value.trim()).filter((value) => value.length > 0),
  };
}

function buildApiKeyEntryView(
  family: AiProviderFamilyId,
  entry: AiProviderApiKeyEntry,
  index: number
): AiProviderEntryView {
  return {
    id: entry.id || `${family}:${index}`,
    index,
    label: entry.prefix?.trim() || sanitizeUrlForView(entry['base-url']) || `Entry ${index + 1}`,
    baseUrl: sanitizeUrlForView(entry['base-url']),
    proxyUrl: sanitizeUrlForView(entry['proxy-url']),
    prefix: entry.prefix?.trim() || undefined,
    headers: toHeaderPairs(entry.headers),
    excludedModels: [...(entry['excluded-models'] || [])],
    models: normalizeModelAliases(entry.models),
    apiKeyMasked: maskSecret(entry['api-key']),
    secretConfigured: Boolean(entry['api-key']),
  };
}

function buildOpenAiCompatEntryView(entry: OpenAICompatEntry, index: number): AiProviderEntryView {
  const quotaDomains = Array.from(
    new Set(
      (entry['api-key-entries'] || [])
        .map((credential) => credential['quota-domain']?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
  return {
    id: entry.id || `openai-compatibility:${index}`,
    index,
    name: entry.name,
    label: entry.name,
    baseUrl: sanitizeUrlForView(entry['base-url']),
    routeChannel: entry['route-channel'],
    quotaDomain: quotaDomains.length === 1 ? quotaDomains[0] : undefined,
    headers: toHeaderPairs(entry.headers),
    excludedModels: [],
    models: normalizeOpenAICompatModels(entry.models),
    apiKeysMasked: (entry['api-key-entries'] || []).map(
      (apiKeyEntry) => maskSecret(apiKeyEntry['api-key']) || '***'
    ),
    secretConfigured: (entry['api-key-entries'] || []).length > 0,
  };
}

function resolveFamilyStatus(entries: AiProviderEntryView[]): AiProviderFamilyState['status'] {
  if (entries.length === 0) return 'empty';
  return entries.every((entry) => entry.secretConfigured) ? 'ready' : 'partial';
}

export async function listAiProviders(): Promise<ListAiProvidersResult> {
  const families = await Promise.all(
    AI_PROVIDER_FAMILY_IDS.map(async (familyId) => {
      const definition = AI_PROVIDER_FAMILY_DEFINITIONS[familyId];
      if (familyId === 'openai-compatibility') {
        const entries = await readFamilyEntries(familyId);
        const entryViews = entries.map((entry, index) => buildOpenAiCompatEntryView(entry, index));
        return {
          ...definition,
          status: resolveFamilyStatus(entryViews),
          entries: entryViews,
        };
      }

      const entries = await readFamilyEntries(familyId);
      const entryViews = entries.map((entry, index) =>
        buildApiKeyEntryView(familyId, entry, index)
      );
      return {
        ...definition,
        status: resolveFamilyStatus(entryViews),
        entries: entryViews,
      };
    })
  );

  return {
    source: getAiProvidersSourceSummary(),
    families,
  };
}

function toApiKeyEntry(
  input: UpsertAiProviderEntryInput,
  existing?: AiProviderApiKeyEntry
): AiProviderApiKeyEntry {
  const nextSecret =
    input.apiKey !== undefined
      ? input.apiKey.trim()
      : input.preserveSecrets
        ? existing?.['api-key'] || ''
        : existing?.['api-key'] || '';

  return {
    id: existing?.id,
    'api-key': nextSecret,
    'base-url': restoreMaskedViewValue(input.baseUrl, existing?.['base-url'], sanitizeUrlForView),
    'proxy-url': restoreMaskedViewValue(
      input.proxyUrl,
      existing?.['proxy-url'],
      sanitizeUrlForView
    ),
    prefix: input.prefix?.trim() || undefined,
    headers: normalizeHeaders(input.headers, existing?.headers),
    'excluded-models': (input.excludedModels || [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    models: normalizeModelAliases(input.models),
  };
}

function toOpenAiCompatEntry(
  input: UpsertAiProviderEntryInput,
  existing?: OpenAICompatEntry
): OpenAICompatEntry {
  const nextApiKeys =
    input.apiKeys !== undefined
      ? input.apiKeys.map((value) => value.trim()).filter((value) => value.length > 0)
      : input.preserveSecrets
        ? (existing?.['api-key-entries'] || []).map((entry) => entry['api-key'])
        : (existing?.['api-key-entries'] || []).map((entry) => entry['api-key']);

  return {
    id: existing?.id,
    name: input.name?.trim() || existing?.name || 'connector',
    'base-url':
      restoreMaskedViewValue(input.baseUrl, existing?.['base-url'], sanitizeUrlForView) ||
      existing?.['base-url'] ||
      '',
    'route-channel': input.routeChannel?.trim() || existing?.['route-channel'],
    headers: normalizeHeaders(input.headers, existing?.headers),
    'api-key-entries': nextApiKeys.map((apiKey, index) => ({
      'api-key': apiKey,
      'quota-domain':
        input.quotaDomain?.trim() || existing?.['api-key-entries']?.[index]?.['quota-domain'],
      'proxy-url': existing?.['api-key-entries']?.[index]?.['proxy-url'],
    })),
    models: normalizeOpenAICompatModels(input.models).map(toOpenAICompatModelEntry),
  };
}

function validateOpenAICompatCatalogContract(input: UpsertAiProviderEntryInput): void {
  const models = input.models || [];
  const catalogModels = models.filter(
    (model) =>
      [
        model.catalogProviderId,
        model.catalogModelId,
        model.catalogRouteProviderId,
        model.catalogRouteModelId,
        model.variantId,
      ].some((value) => Boolean(value?.trim())) || Boolean(model.protocols?.length)
  );
  if (catalogModels.length === 0) return;
  if (!input.routeChannel?.trim()) {
    throw new ValidationError(
      'routeChannel is required when catalog model facts are declared',
      'routeChannel'
    );
  }
  if (
    input.routeChannel.trim() !== input.routeChannel ||
    input.routeChannel.toLowerCase() !== input.routeChannel
  ) {
    throw new ValidationError('routeChannel must be a lower-case canonical string', 'routeChannel');
  }
  if (!input.quotaDomain?.trim()) {
    throw new ValidationError(
      'quotaDomain is required when catalog model facts are declared',
      'quotaDomain'
    );
  }
  catalogModels.forEach((model, index) => {
    const required = [
      ['catalogProviderId', model.catalogProviderId],
      ['catalogModelId', model.catalogModelId],
      ['catalogRouteProviderId', model.catalogRouteProviderId],
      ['catalogRouteModelId', model.catalogRouteModelId],
    ] as const;
    required.forEach(([field, value]) => {
      if (!value || value.trim() !== value) {
        throw new ValidationError(
          `models[${index}].${field} must be a non-empty canonical string`,
          `models[${index}].${field}`
        );
      }
    });
    const protocols = model.protocols || [];
    if (protocols.length === 0) {
      throw new ValidationError(
        `models[${index}].protocols must contain at least one explicit protocol`,
        `models[${index}].protocols`
      );
    }
    const normalized = protocols.map((value) => value.trim());
    if (normalized.some((value, protocolIndex) => !value || value !== protocols[protocolIndex])) {
      throw new ValidationError(
        `models[${index}].protocols must contain canonical strings`,
        `models[${index}].protocols`
      );
    }
    if (new Set(normalized).size !== normalized.length) {
      throw new ValidationError(
        `models[${index}].protocols must not contain duplicates`,
        `models[${index}].protocols`
      );
    }
    if (
      normalized.some(
        (value, protocolIndex) => protocolIndex > 0 && value < normalized[protocolIndex - 1]
      )
    ) {
      throw new ValidationError(
        `models[${index}].protocols must be sorted`,
        `models[${index}].protocols`
      );
    }
  });
}

function resolveEntryIndex(entries: Array<{ id?: string }>, entryId: string): number {
  const normalizedEntryId = entryId.trim();
  const matchedIndex = entries.findIndex((entry) => entry.id === normalizedEntryId);
  if (matchedIndex !== -1) {
    return matchedIndex;
  }

  const legacyIndex = Number.parseInt(normalizedEntryId, 10);
  if (
    Number.isInteger(legacyIndex) &&
    legacyIndex >= 0 &&
    legacyIndex < entries.length &&
    String(legacyIndex) === normalizedEntryId
  ) {
    return legacyIndex;
  }

  if (normalizedEntryId.startsWith('openai-compatibility:') || normalizedEntryId.includes(':')) {
    const legacySuffix = normalizedEntryId.split(':').at(-1) || '';
    const legacySuffixIndex = Number.parseInt(legacySuffix, 10);
    if (
      Number.isInteger(legacySuffixIndex) &&
      legacySuffixIndex >= 0 &&
      legacySuffixIndex < entries.length &&
      String(legacySuffixIndex) === legacySuffix
    ) {
      return legacySuffixIndex;
    }
  }

  throw new ValidationError('Entry not found', 'entryId');
}

function assertEntryId(entryId: string): void {
  if (!entryId.trim()) {
    throw new ValidationError('Entry not found', 'entryId');
  }
}

function validateFamilyInput(family: AiProviderFamilyId, input: UpsertAiProviderEntryInput): void {
  if (family === 'openai-compatibility') {
    if (!(input.name?.trim() || '').length) {
      throw new ValidationError('name is required', 'name');
    }
    if (!(input.baseUrl?.trim() || '').length) {
      throw new ValidationError('baseUrl is required', 'baseUrl');
    }
    if (!input.preserveSecrets && !(input.apiKeys || []).some((value) => value.trim().length > 0)) {
      throw new ValidationError('At least one api key is required', 'apiKeys');
    }
    validateOpenAICompatCatalogContract(input);
    return;
  }

  if (!input.preserveSecrets && !(input.apiKey?.trim() || '').length) {
    throw new ValidationError('apiKey is required', 'apiKey');
  }
}

export async function createAiProviderEntry(
  family: AiProviderFamilyId,
  input: UpsertAiProviderEntryInput
): Promise<void> {
  validateFamilyInput(family, input);

  if (family === 'openai-compatibility') {
    const entries = await readFamilyEntries(family);
    entries.push(toOpenAiCompatEntry(input));
    await writeFamilyEntries(family, entries);
    return;
  }

  const entries = await readFamilyEntries(family);
  entries.push(toApiKeyEntry(input));
  await writeFamilyEntries(family, entries);
}

export async function updateAiProviderEntry(
  family: AiProviderFamilyId,
  entryId: string,
  input: UpsertAiProviderEntryInput
): Promise<void> {
  assertEntryId(entryId);

  if (family === 'openai-compatibility') {
    const entries = await readFamilyEntries(family);
    const index = resolveEntryIndex(entries, entryId);
    validateFamilyInput(family, input);
    entries[index] = toOpenAiCompatEntry(input, entries[index]);
    await writeFamilyEntries(family, entries);
    return;
  }

  const entries = await readFamilyEntries(family);
  const index = resolveEntryIndex(entries, entryId);
  validateFamilyInput(family, input);
  entries[index] = toApiKeyEntry(input, entries[index]);
  await writeFamilyEntries(family, entries);
}

export async function deleteAiProviderEntry(
  family: AiProviderFamilyId,
  entryId: string
): Promise<void> {
  assertEntryId(entryId);

  if (family === 'openai-compatibility') {
    const entries = await readFamilyEntries(family);
    const index = resolveEntryIndex(entries, entryId);
    entries.splice(index, 1);
    await writeFamilyEntries(family, entries);
    return;
  }

  const entries = await readFamilyEntries(family);
  const index = resolveEntryIndex(entries, entryId);
  entries.splice(index, 1);
  await writeFamilyEntries(family, entries);
}
