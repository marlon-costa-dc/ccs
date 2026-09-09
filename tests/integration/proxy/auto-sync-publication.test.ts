import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { sha256Digest } from '../../../src/utils/canonical-json';

interface ProbeMessage {
  kind: string;
  port?: number;
  node?: string;
  rawConfigPath?: string;
  rawConfigDigest?: string;
  status?: { enabled: boolean; watching: boolean; syncing: boolean };
  profile?: unknown;
  expectedProfile?: unknown;
  pipeline?: { snapshot: { generation: number } };
  unchanged?: boolean;
  hasUpdatedModel?: boolean;
  requestLogging?: boolean;
}

async function withProbe(
  scenario: string,
  verify: (probe: {
    send(command: string): void;
    line(text: string): Promise<void>;
    message(kind: string): Promise<ProbeMessage>;
    exited: Promise<{ code: number | null; signal: string | null }>;
    output(): string;
  }) => Promise<void>
): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-publication-watcher-'));
  const events = new EventEmitter();
  const messages: ProbeMessage[] = [];
  let output = '';
  let closed = false;
  let exitResult: { code: number | null; signal: string | null } | undefined;
  const child = spawn(
    'node',
    [path.join(__dirname, 'fixtures/auto-sync-publication-probe.cjs'), scenario],
    {
      env: {
        ...process.env,
        HOME: root,
        USERPROFILE: root,
        CCS_HOME: root,
        CCS_DIR: path.join(root, '.ccs'),
        NODE_OPTIONS: '',
        CCS_DASHBOARD_AUTH_ENABLED: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    }
  );
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
    events.emit('update');
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
    events.emit('update');
  });
  child.on('message', (message: ProbeMessage) => {
    messages.push(message);
    events.emit('update');
  });
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      closed = true;
      exitResult = { code, signal };
      resolve(exitResult);
      events.emit('update');
    });
  });
  function wait<T>(read: () => T | undefined): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        events.off('update', check);
        reject(new Error(`Probe ${scenario} made no progress:\n${output}`));
      }, 5000);
      const check = () => {
        const value = read();
        if (value !== undefined || closed) {
          events.off('update', check);
          clearTimeout(timer);
          if (value !== undefined) resolve(value);
          else reject(new Error(output));
        }
      };
      events.on('update', check);
      check();
    });
  }
  try {
    await verify({
      send: (command) => {
        child.send(command);
      },
      line: async (text) => {
        await wait(() => (output.includes(text) ? true : undefined));
      },
      message: (kind) => wait(() => messages.find((message) => message.kind === kind)),
      get exited() {
        return wait(() => exitResult);
      },
      output: () => output,
    });
  } finally {
    if (!closed) child.kill('SIGKILL');
    await exited;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('dashboard auto-sync publication ownership', () => {
  it('cleans up a probe that never exits', async () => {
    await expect(
      withProbe('format', async (probe) => {
        await probe.message('ready');
        await probe.exited;
      })
    ).rejects.toThrow('Probe format made no progress');
  });
  for (const scenario of [
    'publication',
    'receipt',
    'format',
    'legacy',
    'settings-format',
    'unrelated-settings',
  ]) {
    it(`keeps Node dashboard alive for ${scenario}`, async () => {
      await withProbe(scenario, async (probe) => {
        const ready = await probe.message('ready');
        await probe.line('Watcher ready');
        probe.send('change');
        if (scenario === 'settings-format') {
          await probe.line('Profile change detected: fixture.settings.json');
          probe.send('format');
          await probe.line('Success: 1 profile(s) synced');
        } else if (scenario === 'unrelated-settings') {
          await probe.line('No profiles to sync');
        } else {
          await probe.line('Profile change detected: config.yaml');
          await probe.line(
            scenario === 'legacy' ? 'Success: regenerated' : 'No profile config changes'
          );
        }
        const status = await fetch(`http://127.0.0.1:${ready.port}/api/cliproxy/sync/auto-sync`);
        expect(status.status).toBe(200);
        await status.arrayBuffer();
        probe.send('inspect');
        const state = await probe.message('state');
        expect(state.status).toEqual({ enabled: true, watching: true, syncing: false });
        expect(state.profile).toEqual(state.expectedProfile);
        if (scenario === 'legacy') expect(state.requestLogging).toBe(true);
        else if (scenario === 'settings-format') expect(state.hasUpdatedModel).toBe(true);
        else {
          expect(state.unchanged).toBe(true);
          expect(probe.output()).not.toContain('Success: regenerated');
          if (scenario !== 'format')
            expect(state.pipeline?.snapshot.generation).toBe(scenario === 'receipt' ? 2 : 1);
        }
        probe.send('stop');
        expect(await probe.exited).toEqual({ code: 0, signal: null });
      });
    });
  }

  for (const scenario of ['mixed', 'invalid', 'invalid-backend', 'active-settings']) {
    it(`preserves rejection of ${scenario} changes`, async () => {
      await withProbe(scenario, async (probe) => {
        const ready = await probe.message('ready');
        await probe.line('Watcher ready');
        probe.send('change');
        await probe.line(
          scenario === 'active-settings'
            ? 'Profile change detected: fixture.settings.json'
            : 'Profile change detected: config.yaml'
        );
        const exited = await probe.exited;
        expect(exited.code).not.toBe(0);
        expect(exited.signal).toBeNull();
        expect(probe.output()).toContain('ConfigError:');
        expect(probe.output()).toContain(
          scenario === 'invalid'
            ? 'Invalid config format'
            : scenario === 'invalid-backend'
              ? 'cliproxy.backend must be original or plus'
              : 'canonical publication transaction'
        );
        if (scenario !== 'active-settings') {
          expect(probe.output()).toContain('Profile change detected: config.yaml');
        }
        expect(probe.output()).not.toContain('Success: regenerated');
        expect(ready.rawConfigPath).toBeString();
        expect(sha256Digest(fs.readFileSync(ready.rawConfigPath!))).toBe(ready.rawConfigDigest);
      });
    });
  }
});
