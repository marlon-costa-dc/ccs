import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info, Shield } from 'lucide-react';
import { UsageCommand } from './usage-command';
import type { AuthStatus } from '@/lib/api-client';
import { getProviderSection, isPlusExtraProvider } from '@/lib/provider-config';
import { useTranslation } from 'react-i18next';

interface ProviderInfoTabProps {
  provider: string;
  displayName: string;
  authStatus: AuthStatus;
}

export function ProviderInfoTab({ provider, displayName, authStatus }: ProviderInfoTabProps) {
  const { t } = useTranslation();
  const providerSection = getProviderSection(authStatus.provider);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Info className="h-4 w-4" />
            {t('providerEditor.provider')}
          </h3>
          <div className="space-y-3 rounded-lg border bg-card p-4 text-sm shadow-sm">
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <span className="font-medium text-muted-foreground">
                {t('providerEditor.provider')}
              </span>
              <span className="font-mono">{displayName}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <span className="font-medium text-muted-foreground">
                {t('providerEditor.status')}
              </span>
              {authStatus.authenticated ? (
                <Badge
                  variant="outline"
                  className="w-fit border-green-200 bg-green-50 text-green-600"
                >
                  <Shield className="mr-1 h-3 w-3" />
                  {t('cliproxyPage.connected')}
                </Badge>
              ) : (
                <Badge variant="outline" className="w-fit text-muted-foreground">
                  {t('cliproxyPage.notConnected')}
                </Badge>
              )}
            </div>
            {providerSection ? (
              <div className="grid grid-cols-[100px_1fr] items-start gap-2">
                <span className="font-medium text-muted-foreground">
                  {t('providerConfig.trackLabel')}
                </span>
                <div className="space-y-1">
                  <span className="font-mono">{t(providerSection.labelKey)}</span>
                  <p className="text-xs text-muted-foreground">
                    {t(providerSection.hintKey)}
                    {isPlusExtraProvider(authStatus.provider)
                      ? ` ${t('providerConfig.plusTrackNote')}`
                      : ''}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-medium">{t('providerEditor.quickUsage')}</h3>
          <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
            <UsageCommand
              label={t('profileEditor.runWithProfile')}
              command={`ccs ${provider} "your prompt"`}
            />
            <UsageCommand
              label={t('providerEditor.addAccount')}
              command={`ccs ${provider} --auth --add`}
            />
            <UsageCommand
              label={t('providerEditor.accounts')}
              command={`ccs ${provider} --accounts`}
            />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
