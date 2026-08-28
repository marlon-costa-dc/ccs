import { AlertCircle, CheckCircle2, Clock3, Database, Route } from 'lucide-react';
import { useModelPipeline } from '@/hooks/use-cliproxy';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  ModelPipelineCandidate,
  ModelPipelineConfig,
} from '../../../../src/config/schemas/model-pipeline-types';

interface ModelPipelineSnapshotCardViewProps {
  readonly pipeline?: ModelPipelineConfig;
  readonly error?: Error | null;
  readonly isVerifying: boolean;
}

function CandidateCard({ candidate }: { readonly candidate: ModelPipelineCandidate }) {
  return (
    <div
      className="space-y-3 rounded-lg border bg-background/70 p-4"
      data-testid="pipeline-candidate"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">rank {candidate.rank}</Badge>
            <span className="font-mono text-sm font-semibold">
              {candidate.catalog_provider_id}/{candidate.canonical_model_id}
            </span>
            {candidate.variant_id !== null && (
              <Badge variant="secondary">variant {candidate.variant_id}</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            runtime {candidate.runtime_model_id} via {candidate.route_channel}
          </p>
        </div>

        <Badge variant={candidate.health.selectable ? 'default' : 'destructive'}>
          {candidate.health.status} · {candidate.health.selectable ? 'selectable' : 'blocked'}
        </Badge>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Latency</dt>
          <dd className="font-mono">
            {candidate.health.latency_ms === null
              ? 'not observed'
              : `${candidate.health.latency_ms} ms`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Quota domains</dt>
          <dd className="break-words font-mono">{candidate.quota_domains.join(', ')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Protocols</dt>
          <dd className="break-words font-mono">{candidate.protocols.join(', ')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Observed at</dt>
          <dd className="break-words font-mono">{candidate.health.observed_at}</dd>
        </div>
      </dl>

      <div className="rounded-md bg-muted/50 p-3 text-xs">
        <span className="font-medium">Selection evidence:</span> {candidate.selection_reason}
      </div>

      {candidate.pricing !== null && (
        <div>
          <p className="mb-2 text-xs font-medium">
            Pricing · {candidate.pricing.currency} · {candidate.pricing.unit} · source{' '}
            {candidate.pricing.source_id}
          </p>
          <div className="flex flex-wrap gap-2">
            {candidate.pricing.entries.map((entry, index) => (
              <Badge
                key={`${entry.name}:${entry.tier_type ?? ''}:${entry.tier_size ?? ''}:${entry.context_key ?? ''}:${index}`}
                variant="outline"
                className="font-mono"
              >
                {entry.name} {entry.amount}
                {entry.tier_type !== null ? ` · ${entry.tier_type} ${entry.tier_size}` : ''}
                {entry.context_key !== null ? ` · ${entry.context_key}` : ''}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {candidate.restrictions.length > 0 && (
        <div className="space-y-1 text-xs text-destructive">
          {candidate.restrictions.map((restriction) => (
            <p key={`${restriction.rule_id}:${restriction.config_path}`}>
              {restriction.rule_id} · {restriction.config_path} · {restriction.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function ModelPipelineSnapshotCardView({
  pipeline,
  error,
  isVerifying,
}: ModelPipelineSnapshotCardViewProps) {
  if (isVerifying) {
    return (
      <Card aria-label="Verifying active model pipeline">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> Model pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Verifying active CLIProxy inventory…</p>
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" data-testid="model-pipeline-error">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Verified model pipeline unavailable</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!pipeline) {
    return (
      <Alert variant="destructive" data-testid="model-pipeline-error">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Verified model pipeline unavailable</AlertTitle>
        <AlertDescription>The API returned no verified snapshot.</AlertDescription>
      </Alert>
    );
  }

  const { snapshot } = pipeline;

  return (
    <Card data-testid="model-pipeline-snapshot">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Active model pipeline
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">generation {snapshot.generation}</Badge>
            <Badge variant="secondary">schema v{pipeline.schema_version}</Badge>
          </div>
        </div>

        <dl className="grid gap-2 text-xs">
          <div className="flex min-w-0 items-start gap-2">
            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div>
              <dt className="text-muted-foreground">Generated at</dt>
              <dd className="break-all font-mono">{snapshot.generated_at}</dd>
            </div>
          </div>
          <div>
            <dt className="text-muted-foreground">Snapshot digest</dt>
            <dd className="break-all font-mono">{snapshot.snapshot_digest}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Projection digest</dt>
            <dd className="break-all font-mono">{snapshot.projection_digest}</dd>
          </div>
        </dl>
      </CardHeader>

      <CardContent className="space-y-6">
        <section aria-labelledby="pipeline-agent-bindings">
          <h3 id="pipeline-agent-bindings" className="mb-2 text-sm font-semibold">
            Agent defaults
          </h3>
          <div className="flex flex-wrap gap-2">
            {snapshot.agent_bindings.map((binding) => (
              <Badge key={binding.agent} variant="outline">
                {binding.agent} → {binding.alias} ({binding.tier_id})
              </Badge>
            ))}
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="pipeline-assignments">
          <h3 id="pipeline-assignments" className="flex items-center gap-2 text-sm font-semibold">
            <Route className="h-4 w-4" /> Published aliases
          </h3>
          {snapshot.assignments.map((assignment) => (
            <article key={assignment.tier_id} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-mono font-semibold">{assignment.alias}</h4>
                  <p className="text-xs text-muted-foreground">
                    tier {assignment.tier_id} · {assignment.reason}
                  </p>
                </div>
                <Badge variant={assignment.selectable ? 'default' : 'destructive'}>
                  {assignment.selectable ? 'selectable' : 'blocked'}
                </Badge>
              </div>

              <div className="space-y-3">
                {assignment.candidates.map((candidate) => (
                  <CandidateCard
                    key={`${candidate.catalog_provider_id}:${candidate.canonical_model_id}:${candidate.route_channel}:${candidate.variant_id ?? ''}`}
                    candidate={candidate}
                  />
                ))}
              </div>
            </article>
          ))}
        </section>

        <section aria-labelledby="pipeline-rejections">
          <h3 id="pipeline-rejections" className="mb-2 text-sm font-semibold">
            Rejections ({snapshot.rejections.length})
          </h3>
          {snapshot.rejections.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No rejected candidates in this snapshot.
            </p>
          ) : (
            <div className="space-y-2">
              {snapshot.rejections.map((rejection) => (
                <div
                  key={`${rejection.tier_id}:${rejection.catalog_provider_id}:${rejection.canonical_model_id}:${rejection.route_channel}:${rejection.variant_id ?? ''}:${rejection.rule_id}`}
                  className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs"
                >
                  <p className="font-mono font-medium">
                    {rejection.catalog_provider_id}/{rejection.canonical_model_id} ·{' '}
                    {rejection.route_channel}
                    {rejection.variant_id !== null ? ` · variant ${rejection.variant_id}` : ''}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    tier {rejection.tier_id} · {rejection.rule_id} · {rejection.config_path}
                  </p>
                  <p className="mt-1">{rejection.reason}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export function ModelPipelineSnapshotCard() {
  const query = useModelPipeline();

  return (
    <ModelPipelineSnapshotCardView
      pipeline={query.isError || query.isFetching ? undefined : query.data}
      error={query.isError ? query.error : null}
      isVerifying={query.isFetching}
    />
  );
}
