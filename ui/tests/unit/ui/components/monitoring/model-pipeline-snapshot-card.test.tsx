import { render, screen, within } from '@tests/setup/test-utils';
import { describe, expect, it } from 'vitest';
import { ModelPipelineSnapshotCardView } from '@/components/monitoring/model-pipeline-snapshot-card';
import type { ModelPipelineConfig } from '../../../../../../src/config/schemas/model-pipeline-types';
import { modelPipelineConfigFixture } from '../../../../../../src/config/schemas/__tests__/fixtures/model-pipeline-v3-fixture';

function pipelineFixture(): ModelPipelineConfig {
  return modelPipelineConfigFixture() as unknown as ModelPipelineConfig;
}

describe('ModelPipelineSnapshotCardView', () => {
  it('renders snapshot-backed assignments and candidate evidence in published order', () => {
    const pipeline = pipelineFixture();
    const first = pipeline.snapshot.assignments[0].members[0].candidates[0];
    const second = {
      ...pipeline.snapshot.assignments[0].members[0].candidates[1],
      variant_id: 'high',
      selection_reason: 'second eligible route from the published snapshot',
    };

    const viewPipeline = {
      ...pipeline,
      snapshot: {
        ...pipeline.snapshot,
        assignments: [
          {
            ...pipeline.snapshot.assignments[0],
            members: [
              {
                ...pipeline.snapshot.assignments[0].members[0],
                candidates: [first, second],
              },
            ],
          },
        ],
        rejections: [
          {
            route_key: {
              model_key: {
                catalog_provider_id: 'zai',
                canonical_model_id: 'glm-5.3',
              },
              route_channel: 'openai',
            },
            variant_id: 'thinking',
            tier_id: 'frontier',
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

    expect(screen.getByText('generation 1')).toBeInTheDocument();
    expect(screen.getByText(pipeline.snapshot.snapshot_digest)).toBeInTheDocument();
    expect(screen.getByText(pipeline.receipt.active.projection_digest)).toBeInTheDocument();
    expect(screen.getByText('architect → ai-hub-balanced (balanced)')).toBeInTheDocument();
    expect(screen.getAllByText('not observed')).toHaveLength(2);
    expect(screen.getByText('runtime-failing')).toBeInTheDocument();
    expect(screen.getByText('runtime-success')).toBeInTheDocument();
    expect(
      screen.getAllByText(/Pricing · USD · per_million_tokens · source models_dev/)
    ).toHaveLength(2);

    const candidates = screen.getAllByTestId('pipeline-candidate');
    expect(within(candidates[0]).getByText('openai/gpt-5.4-pro')).toBeInTheDocument();
    expect(within(candidates[1]).getByText('openai/gpt-5.4-pro')).toBeInTheDocument();
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
