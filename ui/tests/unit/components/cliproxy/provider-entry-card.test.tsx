import { describe, expect, it, vi } from 'vitest';

import { ProviderEntryCard } from '@/components/cliproxy/ai-providers/provider-entry-card';
import { render, screen } from '../../../setup/test-utils';

describe('ProviderEntryCard', () => {
  it('renders mapped models as requested to upstream', () => {
    render(
      <ProviderEntryCard
        family={{
          id: 'openai-compatibility',
          displayName: 'OpenAI-Compatible',
          description: 'Connectors',
          authMode: 'connector',
          routePath: '/api/provider/openai-compat',
          status: 'ready',
          supportsNamedEntries: true,
          entries: [],
        }}
        entry={{
          id: 'openai-compatibility:0',
          index: 0,
          name: 'openrouter',
          label: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          headers: [],
          excludedModels: [],
          models: [{ name: 'gpt-5', alias: 'claude-sonnet-4-5' }],
          apiKeysMasked: ['...1234'],
          secretConfigured: true,
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('claude-sonnet-4-5')).toBeInTheDocument();
    expect(screen.getByText('gpt-5')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
  });
});
