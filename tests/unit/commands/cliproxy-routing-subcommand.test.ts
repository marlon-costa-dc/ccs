import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

describe('cliproxy routing command dispatch', () => {
  let calls: string[] = [];

  beforeEach(() => {
    calls = [];

    mock.module('../../../src/commands/cliproxy/routing-subcommand', () => ({
      handleRoutingStatus: async () => {
        calls.push('status');
      },
      handleRoutingExplain: async () => {
        calls.push('explain');
      },
      handleRoutingSet: async (args: string[]) => {
        calls.push(`set:${args.join(' ')}`);
      },
      // Mock module must expose every named export `cliproxy/index.ts`
      // statically imports from this module, otherwise Bun reports
      // `Export named 'X' not found` at module-graph resolution time.
      handleRoutingAffinityStatus: async () => {
        calls.push('affinity:status');
      },
      handleRoutingAffinityHelp: async () => {
        calls.push('affinity:help');
      },
      handleRoutingAffinitySet: async (args: string[]) => {
        calls.push(`affinity:set:${args.join(' ')}`);
      },
    }));
  });

  afterEach(() => {
    mock.restore();
  });

  async function loadHandleCliproxyCommand() {
    const mod = await import(`../../../src/commands/cliproxy/index?test=${Date.now()}-${Math.random()}`);
    return mod.handleCliproxyCommand;
  }

  it('shows routing status by default', async () => {
    const handleCliproxyCommand = await loadHandleCliproxyCommand();
    await handleCliproxyCommand(['routing']);
    expect(calls).toEqual(['status']);
  });

  it('shows the routing explainer', async () => {
    const handleCliproxyCommand = await loadHandleCliproxyCommand();
    await handleCliproxyCommand(['routing', 'explain']);
    expect(calls).toEqual(['explain']);
  });

  it('passes the explicit strategy to set', async () => {
    const handleCliproxyCommand = await loadHandleCliproxyCommand();
    await handleCliproxyCommand(['routing', 'set', 'fill-first']);
    expect(calls).toEqual(['set:fill-first']);
  });
});
