/**
 * Proxy Section
 * Settings section for CLIProxyAPI configuration (local/remote)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Cloud,
  Bug,
  Box,
  AlertTriangle,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { useProxyConfig, useRawConfig } from '../../hooks';
import { useUpdateBackend, useProxyStatus } from '@/hooks/use-cliproxy';
import { LocalProxyCard } from './local-proxy-card';
import { RemoteProxyCard } from './remote-proxy-card';
import { ProxyStatusWidget } from '@/components/monitoring/proxy-status-widget';
import { api } from '@/lib/api-client';
import { CLIPROXY_DEFAULT_PORT } from '@/lib/preset-utils';
import { RISK_ACK_PHRASE } from '@/components/account/antigravity-responsibility-constants';
import {
  CORE_CLIPROXY_PROVIDERS,
  PLUS_EXTRA_CLIPROXY_PROVIDERS,
  getProviderDisplayName,
  variantUsesPlusExtraProvider,
} from '@/lib/provider-config';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

/** LocalStorage key for debug mode preference */
const DEBUG_MODE_KEY = 'ccs_debug_mode';

function normalizeRiskAckPhrase(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export default function ProxySection() {
  const { t } = useTranslation();
  const {
    config,
    loading,
    saving,
    error,
    success,
    testResult,
    testing,
    editedHost,
    setEditedHost,
    editedPort,
    setEditedPort,
    editedAuthToken,
    setEditedAuthToken,
    editedManagementKey,
    setEditedManagementKey,
    editedLocalPort,
    setEditedLocalPort,
    fetchConfig,
    saveConfig,
    testConnection,
  } = useProxyConfig();

  const { fetchRawConfig } = useRawConfig();

  // Debug mode state (persisted in localStorage)
  const [debugMode, setDebugMode] = useState(() => {
    try {
      return localStorage.getItem(DEBUG_MODE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [agyAckBypass, setAgyAckBypass] = useState(false);
  const [agyAckBypassLoading, setAgyAckBypassLoading] = useState(true);
  const [agyAckBypassSaving, setAgyAckBypassSaving] = useState(false);
  const [showAgyEnableConfirm, setShowAgyEnableConfirm] = useState(false);
  const [agyEnableConfirmPhrase, setAgyEnableConfirmPhrase] = useState('');
  const agyAckBypassSavingRef = useRef(false);
  const isAgyConfirmPhraseValid =
    normalizeRiskAckPhrase(agyEnableConfirmPhrase) === RISK_ACK_PHRASE;

  const handleDebugModeChange = (enabled: boolean) => {
    setDebugMode(enabled);
    try {
      localStorage.setItem(DEBUG_MODE_KEY, String(enabled));
    } catch {
      // Ignore storage errors
    }
  };

  const fetchAgyAckBypass = useCallback(async () => {
    try {
      setAgyAckBypassLoading(true);
      const response = await fetch('/api/settings/auth/antigravity-risk');
      if (!response.ok) {
        throw new Error(t('settingsProxy.failedLoadAgyMode'));
      }
      const data = (await response.json()) as { antigravityAckBypass?: boolean };
      setAgyAckBypass(data.antigravityAckBypass === true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settingsProxy.failedLoadAgyMode'));
      setAgyAckBypass(false);
    } finally {
      setAgyAckBypassLoading(false);
    }
  }, [t]);

  const persistAgyAckBypass = useCallback(
    async (nextValue: boolean) => {
      if (agyAckBypassSavingRef.current || agyAckBypassSaving || saving) return;

      try {
        agyAckBypassSavingRef.current = true;
        setAgyAckBypassSaving(true);

        const response = await fetch('/api/settings/auth/antigravity-risk', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ antigravityAckBypass: nextValue }),
        });

        const payload = (await response.json()) as {
          antigravityAckBypass?: boolean;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || t('settingsProxy.failedUpdateAgyMode'));
        }

        const persistedValue = payload.antigravityAckBypass === true;

        const verifyResponse = await fetch('/api/settings/auth/antigravity-risk', {
          cache: 'no-store',
        });
        if (!verifyResponse.ok) {
          throw new Error(t('settingsProxy.failedVerifyAgyMode'));
        }
        const verifyData = (await verifyResponse.json()) as { antigravityAckBypass?: boolean };
        const verifiedValue = verifyData.antigravityAckBypass === true;
        if (verifiedValue !== nextValue) {
          throw new Error(t('settingsProxy.notPersistedAgyMode'));
        }

        setAgyAckBypass(verifiedValue && persistedValue);
        setShowAgyEnableConfirm(false);
        setAgyEnableConfirmPhrase('');
        toast.success(
          nextValue ? t('settingsProxy.agyModeEnabled') : t('settingsProxy.agyModeDisabled')
        );
        await fetchRawConfig();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('settingsProxy.failedUpdateAgyMode'));
      } finally {
        agyAckBypassSavingRef.current = false;
        setAgyAckBypassSaving(false);
      }
    },
    [agyAckBypassSaving, fetchRawConfig, saving, t]
  );

  const handleAgyAckBypassChange = useCallback(
    (nextValue: boolean) => {
      if (agyAckBypassSavingRef.current || agyAckBypassSaving || saving) return;

      if (nextValue) {
        setShowAgyEnableConfirm(true);
        return;
      }

      setShowAgyEnableConfirm(false);
      setAgyEnableConfirmPhrase('');
      void persistAgyAckBypass(false);
    },
    [agyAckBypassSaving, persistAgyAckBypass, saving]
  );

  const confirmAgyEnable = useCallback(() => {
    if (!isAgyConfirmPhraseValid) {
      toast.error(t('settingsProxy.typePhraseToContinue', { value: RISK_ACK_PHRASE }));
      return;
    }
    void persistAgyAckBypass(true);
  }, [isAgyConfirmPhraseValid, persistAgyAckBypass, t]);

  // Backend state (loaded from API) + mutation hook for proper query invalidation
  const [backend, setBackend] = useState<'original' | 'plus'>('original');
  const [hasKiroGhcpVariants, setHasKiroGhcpVariants] = useState(false);
  const updateBackendMutation = useUpdateBackend();
  const { data: proxyStatus } = useProxyStatus();
  const isProxyRunning = proxyStatus?.running ?? false;
  const coreProviderNames = CORE_CLIPROXY_PROVIDERS.map(getProviderDisplayName).join(', ');
  const plusProviderNames = PLUS_EXTRA_CLIPROXY_PROVIDERS.map(getProviderDisplayName).join(', ');

  // Fetch backend setting
  const fetchBackend = useCallback(async () => {
    try {
      const result = await api.cliproxyServer.getBackend();
      setBackend(result.backend);
    } catch (err) {
      console.error('[Proxy] Failed to fetch backend:', err);
    }
  }, []);

  // Check for Kiro/ghcp variants
  const checkPlusOnlyVariants = useCallback(async () => {
    try {
      const result = await api.cliproxy.list();
      const hasIncompatible = result.variants.some((variant) =>
        variantUsesPlusExtraProvider(variant)
      );
      setHasKiroGhcpVariants(hasIncompatible);
    } catch (err) {
      console.error('[Proxy] Failed to check variants:', err);
    }
  }, []);

  // Save backend setting using mutation hook (invalidates all related queries)
  const handleBackendChange = (value: 'original' | 'plus') => {
    const previousValue = backend;
    setBackend(value); // Optimistic update
    updateBackendMutation.mutate(
      { backend: value },
      {
        onError: () => {
          setBackend(previousValue); // Rollback on error
        },
      }
    );
  };

  // Log when debug mode changes (sanitize sensitive fields)
  useEffect(() => {
    if (debugMode && config) {
      // Sanitize config before logging to prevent credential exposure
      const sanitizedConfig = {
        ...config,
        remote: {
          ...config.remote,
          auth_token: config.remote.auth_token ? '[REDACTED]' : undefined,
          management_key: config.remote.management_key ? '[REDACTED]' : undefined,
        },
      };
      console.log('[CCS Debug] Debug mode enabled - proxy config:', sanitizedConfig);
    }
  }, [debugMode, config]);

  // Load data on mount
  useEffect(() => {
    fetchConfig();
    void fetchAgyAckBypass();
    fetchRawConfig();

    void fetchBackend();

    void checkPlusOnlyVariants();
  }, [fetchConfig, fetchAgyAckBypass, fetchRawConfig, fetchBackend, checkPlusOnlyVariants]);

  if (loading || !config) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>{t('settings.loading')}</span>
        </div>
      </div>
    );
  }

  const isRemoteMode = config.remote.enabled ?? false;
  // Only block backend switching in local mode when proxy is running
  const isBackendSwitchBlocked = !isRemoteMode && isProxyRunning;
  const remoteConfig = config.remote;
  const fallbackConfig = config.fallback;

  // Get display values (edited or from config)
  const hostInput = config.remote.host ?? '';
  const portInput = config.remote.port !== undefined ? config.remote.port.toString() : '';
  const authTokenInput = config.remote.auth_token ?? '';
  const managementKeyInput = config.remote.management_key ?? '';
  const localPortInput = (config.local.port ?? CLIPROXY_DEFAULT_PORT).toString();

  const displayHost = editedHost ?? hostInput;
  const displayPort = editedPort ?? portInput;
  const displayAuthToken = editedAuthToken ?? authTokenInput;
  const displayManagementKey = editedManagementKey ?? managementKeyInput;
  const displayLocalPort = editedLocalPort ?? localPortInput;

  // Save functions for blur events
  const saveHost = () => {
    const value = editedHost ?? displayHost;
    if (value !== config.remote.host) {
      saveConfig({ remote: { ...remoteConfig, host: value } });
    }
    setEditedHost(null);
  };

  const savePort = () => {
    const portStr = (editedPort ?? displayPort).trim();
    if (portStr === '') {
      if (config.remote.port !== undefined) {
        saveConfig({ remote: { ...remoteConfig, port: undefined } });
      }
      setEditedPort(null);
      return;
    }

    const parsedPort = Number(portStr);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      toast.error(t('settingsProxy.invalidPortOrEmpty'));
      setEditedPort(null);
      return;
    }

    if (parsedPort !== config.remote.port) {
      saveConfig({ remote: { ...remoteConfig, port: parsedPort } });
    }
    setEditedPort(null);
  };

  const saveAuthToken = () => {
    const value = editedAuthToken ?? displayAuthToken;
    if (value !== config.remote.auth_token) {
      saveConfig({ remote: { ...remoteConfig, auth_token: value } });
    }
    setEditedAuthToken(null);
  };

  const saveManagementKey = () => {
    const value = editedManagementKey ?? displayManagementKey;
    if (value !== config.remote.management_key) {
      saveConfig({ remote: { ...remoteConfig, management_key: value || undefined } });
    }
    setEditedManagementKey(null);
  };

  const saveLocalPort = () => {
    const localPortStr = (editedLocalPort ?? displayLocalPort).trim();
    const parsedPort = localPortStr === '' ? CLIPROXY_DEFAULT_PORT : Number(localPortStr);

    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      toast.error(t('settingsProxy.invalidLocalPort'));
      setEditedLocalPort(null);
      return;
    }

    if (parsedPort !== config.local.port) {
      saveConfig({ local: { ...config.local, port: parsedPort } });
    }
    setEditedLocalPort(null);
  };

  const handleTestConnection = () => {
    testConnection({
      host: displayHost,
      port: displayPort,
      protocol: config.remote.protocol || 'http',
      authToken: displayAuthToken,
    });
  };

  return (
    <>
      {/* Toast-style alerts */}
      <div
        className={`absolute left-5 right-5 top-20 z-10 transition-all duration-200 ease-out ${
          error || success
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        {error && (
          <Alert variant="destructive" className="py-2 shadow-lg">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-green-200 bg-green-50 text-green-700 shadow-lg dark:border-green-900/50 dark:bg-green-900/90 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{t('settings.saved')}</span>
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-6">
          <p className="text-sm text-muted-foreground">
            {t('settingsProxy.description', {
              backend:
                backend === 'plus' ? t('settingsProxy.backendPlus') : t('settingsProxy.backend'),
            })}
          </p>

          {/* Proxy Status Widget - Quick access to start/stop controls */}
          {!isRemoteMode && (
            <div className="space-y-3">
              <h3 className="text-base font-medium">{t('settingsProxy.instanceStatus')}</h3>
              <ProxyStatusWidget />
            </div>
          )}

          {/* Mode Toggle - Card based selection */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">{t('settingsProxy.connectionMode')}</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Local Mode Card */}
              <button
                onClick={() => saveConfig({ remote: { ...remoteConfig, enabled: false } })}
                disabled={saving}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  !isRemoteMode
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Laptop
                    className={`w-5 h-5 ${!isRemoteMode ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className="font-medium">{t('settingsProxy.local')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settingsProxy.localDesc', {
                    backend:
                      backend === 'plus'
                        ? t('settingsProxy.backendPlus')
                        : t('settingsProxy.backend'),
                  })}
                </p>
              </button>

              {/* Remote Mode Card */}
              <button
                onClick={() => saveConfig({ remote: { ...remoteConfig, enabled: true } })}
                disabled={saving}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  isRemoteMode
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Cloud
                    className={`w-5 h-5 ${isRemoteMode ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className="font-medium">{t('settingsProxy.remote')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settingsProxy.remoteDesc', {
                    backend:
                      backend === 'plus'
                        ? t('settingsProxy.backendPlus')
                        : t('settingsProxy.backend'),
                  })}
                </p>
              </button>
            </div>
          </div>

          {/* Backend Selection - Card based selection */}
          <div className="space-y-3">
            <h3 className="text-base font-medium flex items-center gap-2">
              <Box className="w-4 h-4" />
              {t('settingsProxy.backendBinary')}
            </h3>
            {/* Warning when local proxy is running - must stop to change backend (not applicable in remote mode) */}
            {!isRemoteMode && isProxyRunning && (
              <Alert className="py-2 border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 [&>svg]:top-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  {t('settingsProxy.stopProxyToSwitch')}
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-3">
              {/* Plus Backend Card */}
              <button
                onClick={() => handleBackendChange('plus')}
                disabled={updateBackendMutation.isPending || isBackendSwitchBlocked}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  backend === 'plus'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                } ${isBackendSwitchBlocked ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-medium">{t('settingsProxy.backendPlusApi')}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t('settingsProxy.plusDesc')}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {plusProviderNames}
                </p>
              </button>

              {/* Original Backend Card */}
              <button
                onClick={() => handleBackendChange('original')}
                disabled={updateBackendMutation.isPending || isBackendSwitchBlocked}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  backend === 'original'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                } ${isBackendSwitchBlocked ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-medium">{t('settingsProxy.backendApi')}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                    {t('settingsProxy.default')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{t('settingsProxy.originalDesc')}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {coreProviderNames}
                </p>
              </button>
            </div>
            {backend === 'plus' && (
              <Alert className="py-2 border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 [&>svg]:top-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  {t('settingsProxy.plusFallbackNotice')}
                </AlertDescription>
              </Alert>
            )}
            {/* Warning when original backend selected with Kiro/ghcp variants */}
            {backend === 'original' && hasKiroGhcpVariants && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('settingsProxy.variantsIncompatible', { providers: plusProviderNames })}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Safety */}
          <div className="space-y-3">
            <h3 className="text-base font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-300" />
              {t('settingsProxy.safety')}
            </h3>
            <div className="space-y-3 rounded-lg border border-amber-400/35 bg-amber-50/70 p-4 dark:border-amber-800/60 dark:bg-amber-950/25">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-medium text-sm">{t('settingsProxy.agyModeTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('settingsProxy.agyModeDesc')}</p>
                </div>
                <Switch
                  aria-labelledby="agy-power-user-mode-label"
                  aria-describedby="agy-power-user-mode-description"
                  checked={agyAckBypass}
                  disabled={agyAckBypassLoading || agyAckBypassSaving || saving}
                  onCheckedChange={handleAgyAckBypassChange}
                />
              </div>
              <p
                id="agy-power-user-mode-description"
                className="text-xs text-amber-800/90 dark:text-amber-200/90"
              >
                {t('settingsProxy.agyWarning')}
              </p>
              {showAgyEnableConfirm && (
                <div className="space-y-3 rounded-lg border border-rose-500/40 bg-rose-500/[0.08] p-3.5">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold tracking-wide text-rose-900 dark:text-rose-200">
                      {t('settingsProxy.finalConfirm')}
                    </p>
                    <p className="text-xs leading-relaxed text-rose-800/95 dark:text-rose-200/90">
                      {t('settingsProxy.finalConfirmDesc')}
                    </p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-900 dark:text-rose-200">
                        {t('settingsProxy.step1')}
                      </p>
                      <a
                        href="https://github.com/kaitranntt/ccs/issues/509"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-rose-800 underline decoration-rose-500/60 underline-offset-2 transition-colors hover:text-rose-700 dark:text-rose-200"
                      >
                        {t('settingsProxy.readIssue')}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-900 dark:text-rose-200">
                        {t('settingsProxy.step2')}
                      </p>
                      <p className="mt-1 text-xs text-rose-800/95 dark:text-rose-200/90">
                        {t('settingsProxy.typePrefix')}{' '}
                        <code className="rounded bg-background/80 px-1 py-0.5 font-mono">
                          {RISK_ACK_PHRASE}
                        </code>{' '}
                        {t('settingsProxy.typeSuffix')}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Input
                      value={agyEnableConfirmPhrase}
                      onChange={(e) => setAgyEnableConfirmPhrase(e.target.value)}
                      placeholder={RISK_ACK_PHRASE}
                      disabled={agyAckBypassSaving || saving}
                      className="font-mono text-xs"
                      aria-label={t('settingsProxy.typePhraseAria')}
                    />
                    <p className="text-[11px] text-rose-800/90 dark:text-rose-200/80">
                      {t('settingsProxy.exactPhrase')}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAgyEnableConfirm(false);
                        setAgyEnableConfirmPhrase('');
                      }}
                      disabled={agyAckBypassSaving || saving}
                    >
                      {t('settingsBackups.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={confirmAgyEnable}
                      disabled={!isAgyConfirmPhraseValid || agyAckBypassSaving || saving}
                    >
                      {t('settingsProxy.enableAgyMode')}
                    </Button>
                  </div>
                </div>
              )}
              <span id="agy-power-user-mode-label" className="sr-only">
                {t('settingsProxy.toggleAgyMode')}
              </span>
            </div>
          </div>

          {/* Remote Settings - Show when remote mode is enabled */}
          {isRemoteMode && (
            <RemoteProxyCard
              config={config}
              saving={saving}
              testing={testing}
              testResult={testResult}
              displayHost={displayHost}
              displayPort={displayPort}
              displayAuthToken={displayAuthToken}
              displayManagementKey={displayManagementKey}
              setEditedHost={setEditedHost}
              setEditedPort={setEditedPort}
              setEditedAuthToken={setEditedAuthToken}
              setEditedManagementKey={setEditedManagementKey}
              onSaveHost={saveHost}
              onSavePort={savePort}
              onSaveAuthToken={saveAuthToken}
              onSaveManagementKey={saveManagementKey}
              onSaveConfig={saveConfig}
              onTestConnection={handleTestConnection}
            />
          )}

          {/* Fallback Settings */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">{t('settingsProxy.fallbackSettings')}</h3>
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              {/* Enable Fallback */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{t('settingsProxy.enableFallback')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('settingsProxy.enableFallbackDesc')}
                  </p>
                </div>
                <Switch
                  checked={fallbackConfig.enabled ?? true}
                  onCheckedChange={(checked) =>
                    saveConfig({ fallback: { ...fallbackConfig, enabled: checked } })
                  }
                  disabled={saving || !isRemoteMode}
                />
              </div>

              {/* Auto-start on fallback */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{t('settingsProxy.autoStartLocal')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('settingsProxy.autoStartLocalDesc')}
                  </p>
                </div>
                <Switch
                  checked={fallbackConfig.auto_start ?? false}
                  onCheckedChange={(checked) =>
                    saveConfig({ fallback: { ...fallbackConfig, auto_start: checked } })
                  }
                  disabled={saving || !isRemoteMode || !fallbackConfig.enabled}
                />
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="space-y-3">
            <h3 className="text-base font-medium flex items-center gap-2">
              <Bug className="w-4 h-4" />
              {t('settingsProxy.advanced')}
            </h3>
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              {/* Debug Mode Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{t('settingsProxy.debugMode')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('settingsProxy.debugModeDesc')}
                  </p>
                </div>
                <Switch
                  checked={debugMode}
                  onCheckedChange={handleDebugModeChange}
                  disabled={saving}
                />
              </div>
              {debugMode && (
                <p className="text-xs text-amber-600 dark:text-amber-400 pl-0.5">
                  {t('settingsProxy.debugModeEnabled')}
                </p>
              )}
            </div>
          </div>

          {/* Local Proxy Settings - Only show in Local mode */}
          {!isRemoteMode && (
            <LocalProxyCard
              config={config}
              saving={saving}
              displayLocalPort={displayLocalPort}
              setEditedLocalPort={setEditedLocalPort}
              onSaveLocalPort={saveLocalPort}
              onSaveConfig={saveConfig}
            />
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t bg-background">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchConfig();
            fetchAgyAckBypass();
            fetchRawConfig();
            fetchBackend();
            checkPlusOnlyVariants();
          }}
          disabled={loading || saving || agyAckBypassSaving}
          className="w-full"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('settings.refresh')}
        </Button>
      </div>
    </>
  );
}
