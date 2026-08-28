/**
 * Provider account view.
 *
 * Model selection and CLIProxy routing are projected exclusively from the
 * verified model-pipeline snapshot. This view deliberately exposes no model,
 * preset, raw-config, retry, or routing editor.
 */

import { usePrivacy } from '@/contexts/privacy-context';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AccountsSection } from './accounts-section';
import { ProviderEditorHeader } from './provider-editor-header';
import { ProviderInfoTab } from './provider-info-tab';
import type { ProviderEditorProps } from './types';

export function ProviderEditor({
  provider,
  displayName,
  authStatus,
  logoProvider,
  isRemoteMode,
  topNotice,
  onAddAccount,
  onReauthAccount,
  onSetDefault,
  onRemoveAccount,
  onPauseToggle,
  onSoloMode,
  onBulkPause,
  onBulkResume,
  isRemovingAccount,
  isPausingAccount,
  isSoloingAccount,
  isBulkPausing,
  isBulkResuming,
}: ProviderEditorProps) {
  const { privacyMode } = usePrivacy();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ProviderEditorHeader
        provider={provider}
        displayName={displayName}
        logoProvider={logoProvider}
        isRemoteMode={isRemoteMode}
      />
      {topNotice ? <div className="border-b bg-muted/10 px-4 py-3">{topNotice}</div> : null}
      <div className="grid min-h-0 flex-1 grid-cols-[55%_45%] divide-x overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4">
            <AccountsSection
              accounts={authStatus.accounts}
              onAddAccount={onAddAccount}
              onReauthAccount={onReauthAccount}
              onSetDefault={onSetDefault}
              onRemoveAccount={onRemoveAccount}
              onPauseToggle={onPauseToggle}
              onSoloMode={onSoloMode}
              onBulkPause={onBulkPause}
              onBulkResume={onBulkResume}
              isRemovingAccount={isRemovingAccount}
              isPausingAccount={isPausingAccount}
              isSoloingAccount={isSoloingAccount}
              isBulkPausing={isBulkPausing}
              isBulkResuming={isBulkResuming}
              privacyMode={privacyMode}
            />
          </div>
        </ScrollArea>
        <ProviderInfoTab provider={provider} displayName={displayName} authStatus={authStatus} />
      </div>
    </div>
  );
}

export type { ProviderEditorProps } from './types';
export { AccountItem } from './account-item';
export { AccountsSection } from './accounts-section';
export { ProviderInfoTab } from './provider-info-tab';
export { ProviderEditorHeader } from './provider-editor-header';
export { UsageCommand } from './usage-command';
