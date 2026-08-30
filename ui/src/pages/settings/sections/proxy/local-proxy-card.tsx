/**
 * Local Proxy Card
 * Configuration card for local CLIProxyAPI settings
 */

import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { CLIPROXY_DEFAULT_PORT } from '@/lib/preset-utils';
import type { CliproxyServerConfig } from '../../types';
import { useTranslation } from 'react-i18next';

interface LocalProxyCardProps {
  config: CliproxyServerConfig;
  saving: boolean;
  displayLocalPort: string;
  setEditedLocalPort: (value: string | null) => void;
  onSaveLocalPort: () => void;
  onSaveConfig: (updates: Partial<CliproxyServerConfig>) => void;
}

export function LocalProxyCard({
  config,
  saving,
  displayLocalPort,
  setEditedLocalPort,
  onSaveLocalPort,
  onSaveConfig,
}: LocalProxyCardProps) {
  const { t } = useTranslation();
  const localConfig = config.local;

  return (
    <div className="space-y-3">
      <h3 className="text-base font-medium">{t('settingsProxy.localProxy')}</h3>
      <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
        {/* Port */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">{t('settingsProxy.port')}</label>
          <Input
            type="text"
            inputMode="numeric"
            value={displayLocalPort}
            onChange={(e) => setEditedLocalPort(e.target.value.replace(/\D/g, ''))}
            onBlur={onSaveLocalPort}
            placeholder={`${CLIPROXY_DEFAULT_PORT}`}
            className="font-mono max-w-32"
            disabled={saving}
          />
        </div>

        {/* Auto-start */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">{t('settingsProxy.autoStart')}</p>
            <p className="text-xs text-muted-foreground">{t('settingsProxy.localAutoStartDesc')}</p>
          </div>
          <Switch
            checked={localConfig.auto_start ?? true}
            onCheckedChange={(checked) =>
              onSaveConfig({ local: { ...localConfig, auto_start: checked } })
            }
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}
