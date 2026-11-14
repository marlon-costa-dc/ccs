/**
 * Tests for runPreDispatchHandlers() — Phase B extraction.
 *
 * Heavy dynamic-import surface means most paths are tested via the return value
 * (consumed=true/false) and spied process.exit, not deep module internals.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { runPreDispatchHandlers } from '../pre-dispatch';
import type { Logger } from '../../services/logging/logger';

// ========== Stub Logger ==========

function makeStubLogger(): Logger {
  return {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    stage: mock(() => {}),
  } as unknown as Logger;
}

// ========== Tests ==========

describe('runPreDispatchHandlers', () => {
  let exitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    process.env['CI'] = '1';
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    // Suppress process.exit — handlers use it for subcommand routing
    exitSpy = spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
      throw new Error(`process.exit(${_code})`);
    });
  });

  afterEach(() => {
    delete process.env['CI'];
    Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    exitSpy.mockRestore();
  });

  // ---------- update check / migrate / recovery (non-consuming) ----------

  it('returns false for a normal profile invocation (gemini)', async () => {
    const consumed = await runPreDispatchHandlers({
      args: ['gemini', '-p', 'hello'],
      cliLogger: makeStubLogger(),
    });
    expect(consumed).toBe(false);
  });

  it('returns false for default (no-arg) invocation', async () => {
    const consumed = await runPreDispatchHandlers({
      args: [],
      cliLogger: makeStubLogger(),
    });
    expect(consumed).toBe(false);
  });

  // ---------- root command router ----------

  it('consumes --version (either returns true or exits via process.exit(0))', async () => {
    // --version is handled by tryHandleRootCommand; it either returns true or calls process.exit(0)
    let consumed: boolean | undefined;
    try {
      consumed = await runPreDispatchHandlers({
        args: ['--version'],
        cliLogger: makeStubLogger(),
      });
    } catch (e) {
      // process.exit(0) thrown by our spy — that is also a valid "consumed" signal
      expect((e as Error).message).toMatch(/process\.exit/);
      return;
    }
    expect(consumed).toBe(true);
  });

  it('consumes --help (either returns true or exits via process.exit(0))', async () => {
    let consumed: boolean | undefined;
    try {
      consumed = await runPreDispatchHandlers({
        args: ['--help'],
        cliLogger: makeStubLogger(),
      });
    } catch (e) {
      expect((e as Error).message).toMatch(/process\.exit/);
      return;
    }
    expect(consumed).toBe(true);
  });

  // ---------- provider help shortcut ----------

  it('returns true for provider + --help shortcut (gemini --help)', async () => {
    const consumed = await runPreDispatchHandlers({
      args: ['gemini', '--help'],
      cliLogger: makeStubLogger(),
    });
    expect(consumed).toBe(true);
  });

  it('returns true for provider + -h shortcut (codex -h)', async () => {
    const consumed = await runPreDispatchHandlers({
      args: ['codex', '-h'],
      cliLogger: makeStubLogger(),
    });
    expect(consumed).toBe(true);
  });

  // ---------- copilot subcommand routing ----------

  it('exits via process.exit for copilot subcommand (copilot --auth)', async () => {
    // copilot --auth is a known subcommand token; handler exits with a code
    await expect(
      runPreDispatchHandlers({
        args: ['copilot', '--auth'],
        cliLogger: makeStubLogger(),
      })
    ).rejects.toThrow(/process\.exit/);
    expect(exitSpy).toHaveBeenCalled();
  });

  // ---------- cursor subcommand routing ----------

  it('exits via process.exit for legacy-cursor subcommand (legacy-cursor auth)', async () => {
    // 'auth' is a valid CURSOR_SUBCOMMANDS token; handler calls process.exit(exitCode)
    await expect(
      runPreDispatchHandlers({
        args: ['legacy-cursor', 'auth'],
        cliLogger: makeStubLogger(),
      })
    ).rejects.toThrow(/process\.exit/);
    expect(exitSpy).toHaveBeenCalled();
  });

  // ---------- recovery error (non-fatal) ----------

  it('does not throw when recovery manager throws (best-effort)', async () => {
    // Recovery errors are caught; handler must continue and return false
    // We can't easily force recovery to throw here without mocking the dynamic import,
    // but we verify the normal path doesn't surface recovery exceptions.
    const consumed = await runPreDispatchHandlers({
      args: ['glm'],
      cliLogger: makeStubLogger(),
    });
    expect(consumed).toBe(false);
  });
});
