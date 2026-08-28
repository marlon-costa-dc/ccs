import { Badge } from '@/components/ui/badge';
import { Globe } from 'lucide-react';
import { ProviderLogo } from '../provider-logo';

interface ProviderEditorHeaderProps {
  provider: string;
  displayName: string;
  logoProvider?: string;
  isRemoteMode?: boolean;
}

export function ProviderEditorHeader({
  displayName,
  logoProvider,
  provider,
  isRemoteMode,
}: ProviderEditorHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b bg-background px-6 py-4">
      <div className="flex items-center gap-3">
        <ProviderLogo provider={logoProvider || provider} size="lg" />
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{displayName}</h2>
          {isRemoteMode ? (
            <Badge
              variant="secondary"
              className="gap-1 bg-blue-100 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            >
              <Globe className="h-3 w-3" />
              Remote
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}
