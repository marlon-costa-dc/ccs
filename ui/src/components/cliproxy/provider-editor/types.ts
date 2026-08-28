import type { ReactNode } from 'react';
import type { AuthStatus, OAuthAccount } from '@/lib/api-client';

export interface ProviderEditorProps {
  provider: string;
  displayName: string;
  authStatus: AuthStatus;
  logoProvider?: string;
  isRemoteMode?: boolean;
  topNotice?: ReactNode;
  onAddAccount: () => void;
  onReauthAccount?: (account: OAuthAccount) => void;
  onSetDefault: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onPauseToggle?: (accountId: string, paused: boolean) => void;
  onSoloMode?: (accountId: string) => void;
  onBulkPause?: (accountIds: string[]) => void;
  onBulkResume?: (accountIds: string[]) => void;
  isRemovingAccount?: boolean;
  isPausingAccount?: boolean;
  isSoloingAccount?: boolean;
  isBulkPausing?: boolean;
  isBulkResuming?: boolean;
}

export interface AccountItemProps {
  account: OAuthAccount;
  onSetDefault: () => void;
  onRemove: () => void;
  onReauth?: () => void;
  onPauseToggle?: (paused: boolean) => void;
  onSoloMode?: () => void;
  isRemoving?: boolean;
  isPausingAccount?: boolean;
  isSoloingAccount?: boolean;
  privacyMode?: boolean;
  showQuota?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
}
