import { render, screen, within } from '@tests/setup/test-utils';
import { describe, expect, it } from 'vitest';
import { ModelPipelineSnapshotCardView } from '@/components/monitoring/model-pipeline-snapshot-card';
import type { ModelPipelineConfig } from '../../../../../../src/config/schemas/model-pipeline-types';
import fixture from '../../../../../../src/config/schemas/__tests__/fixtures/model-pipeline-snapshot-v1.json';

function pipelineFixture(): ModelPipelineConfig {
  return structuredClone(fixture.model_pipeline) as ModelPipelineConfig;
}

describe('ModelPipelineSnapshotCardView', () => {
  it('renders snapshot-backed assignments and candidate evidence in published order', () => {
    const pipeline = pipelineFixture();
    const first = pipeline.snapshot.assignments[0].candidates[0];
    const second = {
      ...first,
      canonical_model_id: 'gpt-5.3',
      catalog_route_model_id: 'openai/gpt-5.3',
      runtime_model_id: 'gpt-5.3',
      route_channel: 'anthropic',
      variant_id: 'high',
      rank: 2,
      quota_domains: ['openai-secondary'],
      selection_reason: 'second eligible route from the published snapshot',
    };

    const viewPipeline = {
      ...pipeline,
      snapshot: {
        ...pipeline.snapshot,
        assignments: [
          {
            ...pipeline.snapshot.assignments[0],
            candidates: [first, second],
          },
        ],
        rejections: [
          {
            catalog_provider_id: 'zai',
            canonical_model_id: 'glm-5.3',
            route_channel: 'openai',
            variant_id: 'thinking',
            tier_id: 'primary',
            rule_id: 'quota_available',
            config_path: 'models.tiers.primary.eligibility.quota_available',
            reason: 'quota domain is blocked',
          },
        ],
      },
    } satisfies ModelPipelineConfig;

    render(
      <ModelPipelineSnapshotCardView pipeline={viewPipeline} error={null} isVerifying={false} />
    );

    expect(screen.getByText('generation 42')).toBeInTheDocument();
    expect(screen.getByText(pipeline.snapshot.snapshot_digest)).toBeInTheDocument();
    expect(screen.getByText(pipeline.snapshot.projection_digest)).toBeInTheDocument();
    expect(screen.getByText('codex → aihub-primary (primary)')).toBeInTheDocument();
    expect(screen.getAllByText('137 ms')).toHaveLength(2);
    expect(screen.getByText('openai-primary, openai-secondary')).toBeInTheDocument();
    expect(
      screen.getAllByText(/Pricing · USD · per_million_tokens · source models_dev/)
    ).toHaveLength(2);

    const candidates = screen.getAllByTestId('pipeline-candidate');
    expect(within(candidates[0]).getByText('openai/gpt-5.4')).toBeInTheDocument();
    expect(within(candidates[1]).getByText('openai/gpt-5.3')).toBeInTheDocument();
    expect(within(candidates[1]).getByText('variant high')).toBeInTheDocument();
    expect(
      screen.getByText('models.tiers.primary.eligibility.quota_available', { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText('quota domain is blocked')).toBeInTheDocument();
  });

  it('does not render cached snapshot data when live verification fails', () => {
    render(
      <ModelPipelineSnapshotCardView
        pipeline={pipelineFixture()}
        error={new Error('CLIProxy active snapshot_digest mismatch')}
        isVerifying={false}
      />
    );

    expect(screen.getByTestId('model-pipeline-error')).toBeInTheDocument();
    expect(screen.getByText('CLIProxy active snapshot_digest mismatch')).toBeInTheDocument();
    expect(screen.queryByTestId('model-pipeline-snapshot')).not.toBeInTheDocument();
  });

  it('does not render snapshot data while active inventory is being verified', () => {
    render(<ModelPipelineSnapshotCardView pipeline={pipelineFixture()} error={null} isVerifying />);

    expect(screen.getByText('Verifying active CLIProxy inventory…')).toBeInTheDocument();
    expect(screen.queryByTestId('model-pipeline-snapshot')).not.toBeInTheDocument();
  });
});
