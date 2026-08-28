import { describe, expect, it } from 'vitest';
import { render, screen } from '@tests/setup/test-utils';
import { ProviderInfoTab } from '@/components/cliproxy/provider-editor/provider-info-tab';

const authenticatedStatus = {
  provider: 'codex',
  displayName: 'Codex',
  authenticated: true,
  lastAuth: null,
  tokenFiles: 1,
  accounts: [],
};

describe('ProviderInfoTab', () => {
  it('shows account commands without exposing a model editor command', () => {
    render(
      <ProviderInfoTab provider="codex" displayName="Codex" authStatus={authenticatedStatus} />
    );

    expect(screen.queryByText(/--config/)).not.toBeInTheDocument();
    expect(screen.getByText('ccs codex --auth --add')).toBeInTheDocument();
    expect(screen.getByText('ccs codex --accounts')).toBeInTheDocument();
  });

  it('renders an unauthenticated provider without inventing a connected state', () => {
    render(
      <ProviderInfoTab
        provider="custom-provider"
        displayName="Custom Provider"
        authStatus={{
          ...authenticatedStatus,
          provider: 'custom-provider',
          displayName: 'Custom Provider',
          authenticated: false,
        }}
      />
    );

    expect(screen.getAllByText('Not connected')).not.toHaveLength(0);
    expect(screen.getByText('ccs custom-provider --auth --add')).toBeInTheDocument();
  });

  it('shows the plus-extra track note for community-maintained providers', () => {
    render(
      <ProviderInfoTab
        provider="cursor"
        displayName="Cursor"
        authStatus={{
          ...authenticatedStatus,
          provider: 'cursor',
          displayName: 'Cursor',
        }}
      />
    );

    expect(screen.getByText('Track')).toBeInTheDocument();
    expect(screen.getByText('Plus extras / community-maintained')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Requires the optional Plus backend while that track remains community-maintained\./
      )
    ).toBeInTheDocument();
  });
});
