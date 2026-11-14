import {
  AlertTriangle,
  CheckCircle2,
  Folder,
  Info,
  Route,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QuickCommands } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CodexDashboardDiagnostics } from '@/hooks/use-codex-types';
import { CLIPROXY_NATIVE_CODEX_RECIPE } from '@/lib/codex-config';
import { cn } from '@/lib/utils';

function formatTimestamp(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return 'N/A';
  return new Date(value).toLocaleString();
}

function formatBytes(value: number | null | undefined): string {
  if (!value || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-right break-all', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}

interface CodexOverviewTabProps {
  diagnostics: CodexDashboardDiagnostics;
}

export function CodexOverviewTab({ diagnostics }: CodexOverviewTabProps) {
  const { t } = useTranslation();

  const inspectProfileCommand = diagnostics.config.activeProfile
    ? `codex --profile ${diagnostics.config.activeProfile}`
    : 'codex';
  const supportsManagedRouting = diagnostics.binary.supportsConfigOverrides;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-1">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" />
              {t('codex.howCodexWorks')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="ml-4 list-disc space-y-1.5 [&>li]:pl-1">
              <li>{t('codex.nativeDesc')}</li>
              <li>
                <strong>{t('codex.nativeConfigLabel')}</strong> {t('codex.nativeConfigDesc')}
              </li>
              <li>
                <strong>{t('codex.transientOverridesLabel')}</strong>{' '}
                {t('codex.transientOverridesDesc')}
              </li>
              <li>
                <strong>{t('codex.cliproxyDefaultLabel')}</strong> {t('codex.cliproxyDefaultDesc')}
              </li>
              <li>{t('codex.apiProfilesDefault')}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TerminalSquare className="h-4 w-4" />
              {t('codex.runtimeInstall')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('codex.status')}</span>
              <Badge variant={diagnostics.binary.installed ? 'default' : 'secondary'}>
                {diagnostics.binary.installed ? t('codex.detected') : t('codex.notFound')}
              </Badge>
            </div>
            <DetailRow label={t('codex.detectionSource')} value={diagnostics.binary.source} mono />
            <DetailRow
              label={t('codex.binaryPath')}
              value={diagnostics.binary.path || t('codex.notFound')}
              mono
            />
            <DetailRow
              label={t('codex.installDirectory')}
              value={diagnostics.binary.installDir || 'N/A'}
              mono
            />
            <DetailRow
              label={t('codex.versionLabel')}
              value={diagnostics.binary.version || 'Unknown'}
              mono
            />
            <DetailRow label={t('codex.nativeAliases')} value="ccs-codex, ccsx" mono />
            <DetailRow label={t('codex.ccsProviderShortcut')} value="ccsxp" mono />
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-muted-foreground">
                {t('codex.configOverrideSupport')}
              </span>
              <Badge variant={diagnostics.binary.supportsConfigOverrides ? 'default' : 'secondary'}>
                {diagnostics.binary.supportsConfigOverrides
                  ? t('codex.available')
                  : t('codex.missing')}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4" />
              {t('codex.cliproxyNativeCodex')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {supportsManagedRouting ? (
              <>
                <div className="space-y-1.5">
                  <p>
                    <strong>{t('codex.twoSupportedPaths')}</strong>
                  </p>
                  <ul className="ml-4 list-disc space-y-1 [&>li]:pl-1">
                    <li>
                      <strong>{t('codex.builtInLabel')}</strong> {t('codex.builtInCcsxpDesc')}
                    </li>
                    <li>
                      <strong>{t('codex.nativeRecipeLabel')}</strong> {t('codex.nativeRecipeDesc')}
                    </li>
                  </ul>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="font-medium text-foreground">{t('codex.codexNativeRecipe')}</p>
                  <pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 text-xs text-foreground">
                    {CLIPROXY_NATIVE_CODEX_RECIPE}
                  </pre>
                </div>
                <ol className="ml-4 list-decimal space-y-1.5 [&>li]:pl-1">
                  <li>{t('codex.saveProviderNamedCliproxy')}</li>
                  <li>{t('codex.inTopLevelSetDefault')}</li>
                  <li>{t('codex.exportCliproxyApiKey')}</li>
                </ol>
              </>
            ) : (
              <p>{t('codex.noConfigOverrides')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Folder className="h-4 w-4" />
              {t('codex.configFile')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{t('codex.userConfig')}</span>
                {diagnostics.file.exists ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <DetailRow label={t('codex.path')} value={diagnostics.file.path} mono />
              <DetailRow label={t('codex.resolved')} value={diagnostics.file.resolvedPath} mono />
              <DetailRow label={t('codex.size')} value={formatBytes(diagnostics.file.sizeBytes)} />
              <DetailRow
                label={t('codex.lastModified')}
                value={formatTimestamp(diagnostics.file.mtimeMs)}
              />
              {diagnostics.file.parseError && (
                <p className="text-xs text-amber-600">
                  {t('codex.tomlWarning')}: {diagnostics.file.parseError}
                </p>
              )}
              {diagnostics.file.readError && (
                <p className="text-xs text-destructive">
                  {t('codex.readWarning')}: {diagnostics.file.readError}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              {t('codex.currentUserLayerSummary')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label={t('codex.model')}
              value={diagnostics.config.model || t('codex.notSet')}
              mono
            />
            <DetailRow
              label={t('codex.defaultProvider')}
              value={diagnostics.config.modelProvider || t('codex.notSet')}
              mono
            />
            <DetailRow
              label={t('codex.activeProfile')}
              value={diagnostics.config.activeProfile || t('codex.notSet')}
              mono
            />
            <DetailRow
              label={t('codex.approvalPolicy')}
              value={diagnostics.config.approvalPolicy || t('codex.notSet')}
              mono
            />
            <DetailRow
              label={t('codex.sandboxMode')}
              value={diagnostics.config.sandboxMode || t('codex.notSet')}
              mono
            />
            <DetailRow
              label={t('codex.webSearch')}
              value={diagnostics.config.webSearch || t('codex.notSet')}
              mono
            />
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Badge variant="outline" className="justify-center">
                {t('codex.providersCount', { count: diagnostics.config.modelProviderCount })}
              </Badge>
              <Badge variant="outline" className="justify-center">
                {t('codex.profilesCount', { count: diagnostics.config.profileCount })}
              </Badge>
              <Badge variant="outline" className="justify-center">
                {t('codex.enabledFeaturesCount', {
                  count: diagnostics.config.enabledFeatures.length,
                })}
              </Badge>
              <Badge variant="outline" className="justify-center">
                {t('codex.mcpServersCount', { count: diagnostics.config.mcpServerCount })}
              </Badge>
            </div>
            {diagnostics.config.topLevelKeys.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('codex.userLayerKeysPresent')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {diagnostics.config.topLevelKeys.map((key) => (
                    <Badge key={key} variant="secondary" className="font-mono text-[10px]">
                      {key}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <QuickCommands
          snippets={[
            {
              label: t('codex.nativeShortAlias'),
              command: 'ccsx',
              description: 'Launch the short native Codex runtime alias.',
            },
            {
              label: t('codex.ccsCodexShortcut'),
              command: 'ccsxp "your prompt"',
              description: supportsManagedRouting
                ? t('codex.runBuiltInCodex')
                : 'Requires a Codex build that exposes --config overrides.',
            },
            {
              label: t('codex.explicitProviderRoute'),
              command: 'ccs codex --target codex "your prompt"',
              description: supportsManagedRouting
                ? t('codex.runBuiltInCodexExplicit')
                : 'Requires a Codex build that exposes --config overrides.',
            },
            {
              label: diagnostics.config.activeProfile
                ? 'Inspect active profile'
                : t('codex.openNativeCodex'),
              command: inspectProfileCommand,
              description: diagnostics.config.activeProfile
                ? 'Inspect the active named profile directly in native Codex.'
                : 'Open native Codex without forcing a named profile overlay.',
            },
          ]}
        />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4" />
              {t('codex.runtimeVsProvider')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col rounded-md border p-3 text-sm">
              <p className="font-medium text-foreground">{t('codex.nativeCodexRuntime')}</p>
              <ul className="mt-2 flex-grow list-disc space-y-1.5 pl-4 text-muted-foreground [&>li]:pl-1">
                <li>
                  <code>ccs-codex</code>
                </li>
                <li>
                  <code>ccsx</code>
                </li>
                <li>
                  <code>--target codex</code>
                </li>
              </ul>
              <Badge variant="secondary" className="mt-4 w-fit justify-center font-normal">
                {t('codex.honorsSavedNativeConfig')}
              </Badge>
            </div>
            <div className="flex flex-col rounded-md border p-3 text-sm">
              <p className="font-medium text-foreground">{t('codex.ccsCodexProvider')}</p>
              {supportsManagedRouting ? (
                <>
                  <ul className="mt-2 flex-grow list-disc space-y-1.5 pl-4 text-muted-foreground [&>li]:pl-1">
                    <li>
                      <code>ccsxp</code>
                    </li>
                    <li>
                      <code>ccs codex --target codex</code>
                    </li>
                  </ul>
                  <p className="mt-4 text-muted-foreground">{t('codex.transientOverridesDesc')}</p>
                </>
              ) : (
                <p className="mt-2 text-muted-foreground">{t('codex.unavailableNoConfig')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('codex.supportedFlows')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('codex.flow')}</TableHead>
                  <TableHead>{t('codex.status')}</TableHead>
                  <TableHead>{t('codex.notes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnostics.supportMatrix.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">{entry.label}</TableCell>
                    <TableCell>
                      <Badge variant={entry.supported ? 'default' : 'secondary'}>
                        {entry.supported ? t('codex.yes') : t('codex.no')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {diagnostics.warnings.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {t('codex.warningsTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {diagnostics.warnings.map((warning) => (
                <p key={warning} className="text-sm text-amber-800 dark:text-amber-300">
                  - {warning}
                </p>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
