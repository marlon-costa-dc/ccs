import { describe, expect, it } from 'bun:test';
import type { SpawnSyncReturns } from 'node:child_process';
import { getProcessCommandLineForPlatform } from '../../../src/proxy/proxy-daemon';

function commandResult(stdout: string, status = 0): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [null, stdout, ''],
    stdout,
    stderr: '',
    status,
    signal: null,
  };
}

describe('proxy daemon process command lookup', () => {
  it('uses PowerShell CIM to read Windows process command lines', () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const runCommand = ((command: string, args: readonly string[]) => {
      calls.push({ command, args });
      return commandResult('node proxy-daemon-entry --ccs-openai-proxy-daemon\r\n');
    }) as Parameters<typeof getProcessCommandLineForPlatform>[2];

    expect(getProcessCommandLineForPlatform(4321, 'win32', runCommand)).toBe(
      'node proxy-daemon-entry --ccs-openai-proxy-daemon'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('powershell.exe');
    expect(calls[0].args.join(' ')).toContain('ProcessId = 4321');
  });

  it('returns null when the Windows lookup fails', () => {
    const runCommand = (() => commandResult('', 1)) as unknown as Parameters<
      typeof getProcessCommandLineForPlatform
    >[2];

    expect(getProcessCommandLineForPlatform(4321, 'win32', runCommand)).toBeNull();
  });
});
