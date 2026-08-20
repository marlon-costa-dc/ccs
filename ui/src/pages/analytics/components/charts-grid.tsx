/**
 * Charts Grid Component
 *
 * Tabbed layout for analytics charts: Trends, Models, and Sessions.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsageTrendChart } from '@/components/analytics/usage-trend-chart';
import { ModelBreakdownChart } from '@/components/analytics/model-breakdown-chart';
import { SessionStatsCard } from '@/components/analytics/session-stats-card';
import { CliproxyStatsCard } from '@/components/analytics/cliproxy-stats-card';
import { TrendingUp, PieChart, Users, Zap } from 'lucide-react';
import { usePrivacy } from '@/contexts/privacy-context';
import { useTranslation } from 'react-i18next';
import { CostByModelCard } from './cost-by-model-card';
import type { ModelUsage, PaginatedSessions, DailyUsage, HourlyUsage } from '@/hooks/use-usage';

interface ChartsGridProps {
  viewMode: 'daily' | 'hourly';
  trends: DailyUsage[] | undefined;
  hourlyData: HourlyUsage[] | undefined;
  models: ModelUsage[] | undefined;
  sessions: PaginatedSessions | undefined;
  isTrendsLoading: boolean;
  isHourlyLoading: boolean;
  isModelsLoading: boolean;
  isSessionsLoading: boolean;
  isSummaryLoading: boolean;
  onModelClick: (model: ModelUsage, event: React.MouseEvent) => void;
}

export function ChartsGrid({
  viewMode,
  trends,
  hourlyData,
  models,
  sessions,
  isTrendsLoading,
  isHourlyLoading,
  isModelsLoading,
  isSessionsLoading,
  isSummaryLoading,
  onModelClick,
}: ChartsGridProps) {
  const { privacyMode } = usePrivacy();
  const { t } = useTranslation();
  const trendTitle =
    viewMode === 'hourly' ? t('analyticsPages.last24Hours') : t('analyticsPageV2.tabTrends');

  return (
    <Tabs defaultValue="trends" className="space-y-4">
      <TabsList>
        <TabsTrigger value="trends">{t('analyticsPageV2.tabTrends')}</TabsTrigger>
        <TabsTrigger value="models">{t('analyticsPageV2.tabModels')}</TabsTrigger>
        <TabsTrigger value="sessions">{t('analyticsPageV2.tabSessions')}</TabsTrigger>
      </TabsList>

      {/* Trends Tab */}
      <TabsContent value="trends">
        <Card className="flex flex-col h-full min-h-[220px] lg:min-h-[240px] overflow-hidden gap-0 py-0 shadow-sm">
          <CardHeader className="px-3 py-2 shrink-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {trendTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0 flex-1 min-h-0">
            <UsageTrendChart
              data={viewMode === 'hourly' ? hourlyData || [] : trends || []}
              isLoading={viewMode === 'hourly' ? isHourlyLoading : isTrendsLoading}
              granularity={viewMode === 'hourly' ? 'hourly' : 'daily'}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Models Tab */}
      <TabsContent value="models" className="space-y-4">
        <Card className="flex flex-col h-full min-h-[220px] overflow-hidden gap-0 py-0 shadow-sm">
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              {t('analyticsPages.modelUsage')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2 pt-0 flex-1 min-h-0 flex items-center justify-center">
            <ModelBreakdownChart
              data={models || []}
              isLoading={isModelsLoading}
              className="h-full w-full"
            />
          </CardContent>
        </Card>

        <CostByModelCard
          models={models}
          isLoading={isModelsLoading}
          onModelClick={onModelClick}
          privacyMode={privacyMode}
        />
      </TabsContent>

      {/* Sessions Tab */}
      <TabsContent value="sessions" className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t('analyticsPages.sessionsTab')}
          </h3>
          <SessionStatsCard data={sessions} isLoading={isSessionsLoading} />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4" />
            CLIProxy
          </h3>
          <CliproxyStatsCard isLoading={isSummaryLoading} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
