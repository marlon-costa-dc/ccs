/**
 * Create Auth Profile Dialog
 * Shows CLI command for creating auth profiles (Dashboard cannot spawn Claude login directly)
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Check, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CreateAuthProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

const MAX_CONTEXT_GROUP_LENGTH = 64;

export function CreateAuthProfileDialog({ open, onClose }: CreateAuthProfileDialogProps) {
  const { t } = useTranslation();
  const [profileName, setProfileName] = useState('');
  const [shareContext, setShareContext] = useState(false);
  const [contextGroup, setContextGroup] = useState('');
  const [deeperContinuity, setDeeperContinuity] = useState(false);
  const [copied, setCopied] = useState(false);

  // Validate profile name: alphanumeric, dash, underscore only
  const isValidName = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(profileName);
  const normalizedGroup = contextGroup.trim().toLowerCase().replace(/\s+/g, '-');
  const isValidContextGroup =
    normalizedGroup.length === 0 ||
    (normalizedGroup.length <= MAX_CONTEXT_GROUP_LENGTH &&
      /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(normalizedGroup));

  const command =
    profileName && isValidName
      ? [
          `ccs auth create ${profileName}`,
          shareContext
            ? normalizedGroup.length > 0
              ? `--context-group ${normalizedGroup}`
              : '--share-context'
            : '',
          shareContext && deeperContinuity ? '--deeper-continuity' : '',
        ]
          .filter(Boolean)
          .join(' ')
      : t('createAuthProfileDialog.commandFallback');

  const handleCopy = async () => {
    if (!isValidName || (shareContext && !isValidContextGroup)) return;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setProfileName('');
    setShareContext(false);
    setContextGroup('');
    setDeeperContinuity(false);
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createAuthProfileDialog.title')}</DialogTitle>
          <DialogDescription>{t('createAuthProfileDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">{t('createAuthProfileDialog.profileName')}</Label>
            <Input
              id="profile-name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder={t('createAuthProfileDialog.profileNamePlaceholder')}
              autoComplete="off"
            />
            {profileName && !isValidName && (
              <p className="text-xs text-destructive">
                {t('createAuthProfileDialog.invalidProfileName')}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="share-context"
                checked={shareContext}
                onCheckedChange={(checked) => setShareContext(checked === true)}
              />
              <Label htmlFor="share-context" className="cursor-pointer">
                {t('createAuthProfileDialog.enableSharedHistory')}
              </Label>
            </div>

            {shareContext && (
              <div className="space-y-2 pl-6">
                <Label htmlFor="context-group">
                  {t('createAuthProfileDialog.historySyncGroupOptional')}
                </Label>
                <Input
                  id="context-group"
                  value={contextGroup}
                  onChange={(e) => setContextGroup(e.target.value)}
                  placeholder={t('createAuthProfileDialog.historySyncGroupPlaceholder')}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  {t('createAuthProfileDialog.historySyncGroupHint')}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="deeper-continuity"
                    checked={deeperContinuity}
                    onCheckedChange={(checked) => setDeeperContinuity(checked === true)}
                  />
                  <Label htmlFor="deeper-continuity" className="cursor-pointer">
                    {t('createAuthProfileDialog.deeperContinuity')}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('createAuthProfileDialog.deeperContinuityHint')}
                </p>
                {contextGroup.trim().length > 0 && !isValidContextGroup && (
                  <p className="text-xs text-destructive">
                    {t('createAuthProfileDialog.invalidContextGroup', {
                      max: MAX_CONTEXT_GROUP_LENGTH,
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('createAuthProfileDialog.command')}</Label>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm">
              <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />
              <code className="flex-1 break-all">{command}</code>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-8 px-2"
                onClick={handleCopy}
                disabled={!isValidName || (shareContext && !isValidContextGroup)}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>{t('createAuthProfileDialog.afterRunPrefix')}</p>
            <ol className="list-decimal list-inside pl-2 space-y-0.5">
              <li>{t('createAuthProfileDialog.afterRunStep1')}</li>
              <li>{t('createAuthProfileDialog.afterRunStep2')}</li>
            </ol>
            <p className="pt-1">{t('createAuthProfileDialog.poolingHint')}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose}>
              {t('createAuthProfileDialog.close')}
            </Button>
            <Button
              onClick={handleCopy}
              disabled={!isValidName || (shareContext && !isValidContextGroup)}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {t('createAuthProfileDialog.copied')}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  {t('createAuthProfileDialog.copyCommand')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
