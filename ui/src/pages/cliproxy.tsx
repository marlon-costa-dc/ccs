/**
 * CLIProxy Page - Master-Detail Layout
 * Left sidebar: Provider navigation + Quick actions
 * Right panel: Provider Editor with split-view (settings + code editor)
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, X, RefreshCw, Plus, Zap } from 'lucide-react';
import { AddAccountDialog } from '@/components/account/add-account-dialog';
import { AccountSafetyWarningCard } from '@/components/account/account-safety-warning-card';
import { ProviderEditor } from '@/components/cliproxy/provider-editor';
import { ProviderLogo } from '@/components/cliproxy/provider-logo';
import { ProxyStatusWidget } from '@/components/monitoring/proxy-status-widget';
import {
  useCliproxyAuth,
  useCliproxyCatalog,
  useCliproxyUpdateCheck,
  useSetDefaultAccount,
  useRemoveAccount,
  usePauseAccount,
  useResumeAccount,
  useSoloAccount,
  useBulkPauseAccounts,
  useBulkResumeAccounts,
} from '@/hooks/use-cliproxy';
import type { AuthStatus, OAuthAccount } from '@/lib/api-client';
import { buildUiCatalogs } from '@/lib/model-catalogs';
import {
  getProviderDisplayName,
  groupProvidersBySection,
  isValidProvider,
} from '@/lib/provider-config';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

// Sidebar provider item
function ProviderSidebarItem({
  status,
  isSelected,
  onSelect,
}: {
  status: AuthStatus;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const accountCount = status.accounts?.length || 0;

  return (
    <button
      type="button"
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer text-left',
        isSelected
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-muted border border-transparent'
      )}
      onClick={onSelect}
    >
      <ProviderLogo provider={status.provider} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{status.displayName}</span>
          {accountCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1">
              {accountCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {status.authenticated ? (
            <>
              <Check className="w-3 h-3 text-green-600" />
              <span className="text-xs text-green-600">{t('cliproxyPage.connected')}</span>
            </>
          ) : (
            <>
              <X className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {t('cliproxyPage.notConnected')}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

// Empty state for right panel
function EmptyProviderState({
  onAddAccount,
  canAddAccount,
}: {
  onAddAccount: () => void;
  canAddAccount: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex items-center justify-center bg-muted/20">
      <div className="text-center max-w-md px-8">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
          <Zap className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">{t('cliproxyPage.emptyTitle')}</h2>
        <p className="mb-6 text-muted-foreground">{t('cliproxyPage.emptyDesc')}</p>
        <div className="flex justify-center">
          <Button onClick={onAddAccount} className="gap-2" disabled={!canAddAccount}>
            <Plus className="w-4 h-4" />
            {t('cliproxyPage.addAccount')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CliproxyPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: authData, isLoading: authLoading, isFetching } = useCliproxyAuth();
  const { data: catalogData } = useCliproxyCatalog();
  const { data: updateCheck } = useCliproxyUpdateCheck();
  const setDefaultMutation = useSetDefaultAccount();
  const removeMutation = useRemoveAccount();
  const pauseMutation = usePauseAccount();
  const resumeMutation = useResumeAccount();
  const soloMutation = useSoloAccount();
  const bulkPauseMutation = useBulkPauseAccounts();
  const bulkResumeMutation = useBulkResumeAccounts();

  // Initialize from URL provider deep-link, then the explicit saved selection.
  const [selectedProvider, setSelectedProviderState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const query = new URLSearchParams(window.location.search);
      const queryProvider = query.get('provider')?.trim().toLowerCase();
      if (queryProvider && isValidProvider(queryProvider)) {
        return queryProvider;
      }
      return localStorage.getItem('cliproxy-selected-provider');
    }
    return null;
  });
  const [addAccountProvider, setAddAccountProvider] = useState<{
    provider: string;
    displayName: string;
    isFirstAccount: boolean;
    account?: OAuthAccount;
  } | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const query = new URLSearchParams(window.location.search);
    const queryProvider = query.get('provider')?.trim().toLowerCase();
    const action = query.get('action');

    if (action !== 'auth' || !queryProvider || !isValidProvider(queryProvider)) {
      return null;
    }

    return {
      provider: queryProvider,
      displayName: getProviderDisplayName(queryProvider),
      isFirstAccount: false,
    };
  });

  const providers = useMemo(() => authData?.authStatus || [], [authData?.authStatus]);
  const providerSections = useMemo(
    () => groupProvidersBySection(providers, (status) => status.provider),
    [providers]
  );
  const isRemoteMode = authData?.source === 'remote';
  const catalogs = useMemo(() => buildUiCatalogs(catalogData?.catalogs), [catalogData?.catalogs]);
  const fetchedCatalogsReady = Boolean(catalogData);

  // Wrapper to persist provider selection to localStorage
  const setSelectedProvider = (provider: string | null) => {
    setSelectedProviderState(provider);
    if (provider) {
      localStorage.setItem('cliproxy-selected-provider', provider);
    }
  };

  // Effective provider: prefer saved > first with accounts > first
  const effectiveProvider = useMemo(() => {
    // If saved/selected provider is valid, use it
    if (selectedProvider && providers.some((p) => p.provider === selectedProvider)) {
      return selectedProvider;
    }

    // Auto-select: prefer first provider with accounts (better UX)
    if (providers.length > 0) {
      const providerWithAccounts = providers.find((p) => (p.accounts?.length || 0) > 0);
      return providerWithAccounts?.provider || providers[0]?.provider || null;
    }
    return null;
  }, [selectedProvider, providers]);

  const selectedStatus = providers.find((p) => p.provider === effectiveProvider);
  const selectedAccountTarget = selectedStatus
    ? {
        provider: selectedStatus.provider,
        displayName: selectedStatus.displayName,
        accountCount: selectedStatus.accounts.length,
      }
    : null;
  const fallbackAccountTarget =
    selectedProvider && isValidProvider(selectedProvider)
      ? {
          provider: selectedProvider,
          displayName: getProviderDisplayName(selectedProvider),
          accountCount: 0,
        }
      : null;
  const accountSetupTarget = selectedAccountTarget ?? fallbackAccountTarget;
  const warningProvider = (selectedStatus?.provider || '').toLowerCase().trim();
  const showAccountSafetyWarning = warningProvider === 'gemini' || warningProvider === 'agy';

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
    queryClient.invalidateQueries({ queryKey: ['cliproxy-catalog'] });
  };

  const handlePauseToggle = (provider: string, accountId: string, paused: boolean) => {
    // Prevent rapid clicks while mutation is pending
    if (pauseMutation.isPending || resumeMutation.isPending) return;
    if (paused) {
      pauseMutation.mutate({ provider, accountId });
    } else {
      resumeMutation.mutate({ provider, accountId });
    }
  };

  const handleSoloMode = (provider: string, accountId: string) => {
    if (soloMutation.isPending) return;
    soloMutation.mutate({ provider, accountId });
  };

  const handleBulkPause = (provider: string, accountIds: string[]) => {
    if (bulkPauseMutation.isPending) return;
    bulkPauseMutation.mutate({ provider, accountIds });
  };

  const handleBulkResume = (provider: string, accountIds: string[]) => {
    if (bulkResumeMutation.isPending) return;
    bulkResumeMutation.mutate({ provider, accountIds });
  };

  const handleSelectProvider = (provider: string) => {
    setSelectedProvider(provider);
  };

  const handleAddAccountForSelectedProvider = () => {
    if (!accountSetupTarget) {
      throw new Error('Cannot add an account before selecting a provider');
    }
    setAddAccountProvider({
      provider: accountSetupTarget.provider,
      displayName: accountSetupTarget.displayName,
      isFirstAccount: accountSetupTarget.accountCount === 0,
    });
  };

  const handleReauthAccount = (
    provider: string,
    displayName: string,
    accounts: OAuthAccount[],
    accountId: string
  ) => {
    const account = accounts.find((candidate) => candidate.id === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} is not present in provider ${provider}`);
    }

    setAddAccountProvider({
      provider,
      displayName,
      isFirstAccount: false,
      account,
    });
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-80 border-r flex flex-col bg-muted/30">
        {/* Header */}
        <div className="p-4 border-b bg-background">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              <h1 className="font-semibold">{updateCheck?.backendLabel ?? 'CLIProxy'}</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {t('cliproxyPage.accountManagement')}
          </p>

          <div className="space-y-2">
            <Button
              variant="default"
              size="sm"
              className="w-full gap-2"
              onClick={handleAddAccountForSelectedProvider}
              disabled={!accountSetupTarget}
            >
              <Plus className="w-4 h-4" />
              {t('cliproxyPage.addAccount')}
            </Button>
          </div>
        </div>

        {/* Providers List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-2">
              {t('cliproxyPage.providers')}
            </div>
            {authLoading ? (
              <div className="space-y-2 px-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {providerSections.map((section) => (
                  <div key={section.id} className="space-y-1">
                    <div className="px-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t(section.labelKey)}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {t(section.hintKey)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {section.items.map((status) => (
                        <ProviderSidebarItem
                          key={status.provider}
                          status={status}
                          isSelected={effectiveProvider === status.provider}
                          onSelect={() => handleSelectProvider(status.provider)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Proxy Status Widget */}
        <div className="p-3 border-t">
          <ProxyStatusWidget />
        </div>

        {/* Footer Stats */}
        <div className="p-3 border-t bg-background text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>{t('cliproxyPage.providerCount', { count: providers.length })}</span>
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-green-600" />
              {t('cliproxyPage.connectedCount', {
                count: providers.filter((p) => p.authenticated).length,
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {selectedStatus ? (
          <ProviderEditor
            provider={selectedStatus.provider}
            displayName={selectedStatus.displayName}
            authStatus={selectedStatus}
            isRemoteMode={isRemoteMode}
            topNotice={
              showAccountSafetyWarning ? (
                <AccountSafetyWarningCard compact showProxySettingsLink />
              ) : undefined
            }
            onAddAccount={() =>
              setAddAccountProvider({
                provider: selectedStatus.provider,
                displayName: selectedStatus.displayName,
                isFirstAccount: selectedStatus.accounts.length === 0,
              })
            }
            onReauthAccount={(account) =>
              handleReauthAccount(
                selectedStatus.provider,
                selectedStatus.displayName,
                selectedStatus.accounts,
                account.id
              )
            }
            onSetDefault={(accountId) =>
              setDefaultMutation.mutate({
                provider: selectedStatus.provider,
                accountId,
              })
            }
            onRemoveAccount={(accountId) =>
              removeMutation.mutate({
                provider: selectedStatus.provider,
                accountId,
              })
            }
            onPauseToggle={(accountId, paused) =>
              handlePauseToggle(selectedStatus.provider, accountId, paused)
            }
            onSoloMode={(accountId) => handleSoloMode(selectedStatus.provider, accountId)}
            onBulkPause={(accountIds) => handleBulkPause(selectedStatus.provider, accountIds)}
            onBulkResume={(accountIds) => handleBulkResume(selectedStatus.provider, accountIds)}
            isRemovingAccount={removeMutation.isPending}
            isPausingAccount={pauseMutation.isPending || resumeMutation.isPending}
            isSoloingAccount={soloMutation.isPending}
            isBulkPausing={bulkPauseMutation.isPending}
            isBulkResuming={bulkResumeMutation.isPending}
          />
        ) : (
          <EmptyProviderState
            onAddAccount={handleAddAccountForSelectedProvider}
            canAddAccount={accountSetupTarget !== null}
          />
        )}
      </div>

      {addAccountProvider ? (
        <AddAccountDialog
          open
          onClose={() => setAddAccountProvider(null)}
          provider={addAccountProvider.provider}
          displayName={addAccountProvider.displayName}
          catalog={fetchedCatalogsReady ? catalogs[addAccountProvider.provider] : undefined}
          isFirstAccount={addAccountProvider.isFirstAccount}
          account={addAccountProvider.account}
        />
      ) : null}
    </div>
  );
}
