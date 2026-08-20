/**
 * Flow Visualization Header Component
 *
 * Renders a prominent back button with breadcrumb, a provider switcher
 * dropdown (when onProviderChange is provided), and view toggles
 * (details / paused / reset layout).
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ChevronRight, ArrowLeft, Eye, EyeOff, ListFilter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProviderOption } from './types';

interface FlowVizHeaderProps {
  onBack?: () => void;
  providerName?: string;
  currentProvider?: string;
  providers?: ProviderOption[];
  onProviderChange?: (provider: string) => void;
  showDetails: boolean;
  onToggleDetails: () => void;
  showPausedAccounts: boolean;
  pausedAccountsCount: number;
  onTogglePausedAccounts: () => void;
  hasCustomPositions: boolean;
  onResetPositions: () => void;
}

export function FlowVizHeader({
  onBack,
  providerName,
  currentProvider,
  providers = [],
  onProviderChange,
  showDetails,
  onToggleDetails,
  showPausedAccounts,
  pausedAccountsCount,
  onTogglePausedAccounts,
  hasCustomPositions,
  onResetPositions,
}: FlowVizHeaderProps) {
  const { t } = useTranslation();
  const canSwitchProvider = onProviderChange && providers.length > 0;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
      {/* Left: back button + breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs font-medium"
            onClick={onBack}
            aria-label={t('flowViz.backToProviders')}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('flowViz.backToProviders')}</span>
          </Button>
        )}
        {onBack && providerName && (
          <>
            <ChevronRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
            <span
              className="text-xs font-medium text-foreground truncate max-w-[180px] sm:max-w-[240px]"
              title={providerName}
            >
              {providerName}
            </span>
          </>
        )}
      </div>

      {/* Right: provider switcher + view toggles */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {canSwitchProvider && (
          <Select value={currentProvider ?? undefined} onValueChange={onProviderChange}>
            <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Switch provider">
              <SelectValue placeholder={t('flowViz.provider')} />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.provider} value={p.provider}>
                  <div className="flex flex-col">
                    <span className="font-medium">{p.displayName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {p.totalRequests.toLocaleString()} requests
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <button
          type="button"
          onClick={onToggleDetails}
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium transition-all duration-200 px-3 py-1.5 rounded-md border shadow-sm',
            showDetails
              ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
              : 'bg-background text-muted-foreground hover:text-foreground border-border/60 hover:border-border hover:bg-muted/50'
          )}
        >
          {showDetails ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{showDetails ? t('flowViz.hideDetails') : t('flowViz.showDetails')}</span>
        </button>
        {pausedAccountsCount > 0 && (
          <button
            type="button"
            onClick={onTogglePausedAccounts}
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium transition-all duration-200 px-3 py-1.5 rounded-md border shadow-sm',
              showPausedAccounts
                ? 'bg-background text-muted-foreground hover:text-foreground border-border/60 hover:border-border hover:bg-muted/50'
                : 'bg-amber-500/15 text-amber-700 border-amber-500/40 hover:bg-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'
            )}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>
              {showPausedAccounts
                ? t('flowViz.hidePausedAccounts', { count: pausedAccountsCount })
                : t('flowViz.showPausedAccounts', { count: pausedAccountsCount })}
            </span>
          </button>
        )}
        {hasCustomPositions && (
          <button
            type="button"
            onClick={onResetPositions}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-all duration-200 px-3 py-1.5 rounded-md border border-border/60 hover:border-border bg-background hover:bg-muted/50 shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('flowViz.resetLayout')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export type { ProviderOption };
