# CCS CLI Agent Guide

Canonical agent instructions for `/Users/kaitran/CloudPersonal/ccs/cli`.
`AGENTS.md` must stay a symlink to this file.

## Scope

CCS is a TypeScript/Bun CLI and dashboard for managing Claude Code, Codex,
Factory Droid, CLIProxy, and compatible provider profiles.

## Non-Negotiables

- Default branch is `main`. Feature/fix branches start from `main`; production
  hotfixes start from `main` only when explicitly needed.
- Never touch the user's real `~/.ccs/` or `~/.claude/` in tests. Use
  `getCcsDir()` from `src/utils/config-manager.ts`; it respects `CCS_HOME`.
- Do not commit directly to `main`.
- Do not manually bump versions or create release tags. Semantic-release owns
  versions, changelog, tags, npm publish, and GitHub releases.
- CLI terminal output must be ASCII only: `[OK]`, `[!]`, `[X]`, `[i]`.
- Respect `NO_COLOR` and TTY-aware output.

## Architecture

- `src/` - TypeScript CLI/server source.
- `lib/ccs`, `lib/ccs.ps1` - bootstrap wrappers; no help text here.
- `ui/src/` - React dashboard.
- `dist/` and `dist/ui/` - build outputs.
- `docs/` - local development and architecture docs.
- Docker support lives under `docker/` and related commands.

Profile resolution priority:

1. Built-in CLIProxy providers: Gemini, Codex, Antigravity.
2. User-defined `config.cliproxy` providers.
3. Settings-based `config.profiles`.
4. Account-based `profiles.json` with isolated `CLAUDE_CONFIG_DIR`.

All env values written into settings must be strings.

## Documentation Truth

Use the narrowest authoritative source:

1. Source, tests, package scripts, and workflows define implemented behavior.
2. `CLAUDE.md` and `CONTRIBUTING.md` define repository workflow.
3. `docs/README.md` maps maintainer documentation and its owners.
4. The separate `kaitranntt/ccs-docs` repository and published site own user
   guides and CLI reference.
5. Generated artifacts and live runtime checks define what shipped or is
   currently running.

Do not copy inventories, line counts, locale lists, target lists, or command
details when a stable source link is enough. Update the owning documentation
when behavior, commands, setup, architecture, security posture, or maintainer
workflow changes. Remove stale claims instead of preserving them as TODOs.

## User-Facing Change Checklist

- Update the matching `--help` handler when CLI behavior changes.
- Keep README concise; do not remove `## Community Projects` or
  `## Star History` unless explicitly asked.
- Use neutral broad examples such as `ccs`, `ccs codex`, `ccs glm`, or
  `ccs <provider>` unless the page is provider-specific.
- If CLI commands, config, providers, install steps, or user workflows change,
  update the separate public CCS docs repository. Maintainers using the
  standard CloudPersonal checkout may have it at
  `/Users/kaitran/CloudPersonal/ccs/docs`; fork contributors can use their own
  checkout and coordinate the matching docs change in the PR.

Help locations:

- `ccs --help`: `src/commands/help-command.ts`
- `ccs api --help`: `src/commands/api-command.ts`
- `ccs cleanup --help`: `src/commands/cleanup-command.ts`
- `ccs cliproxy --help`: `src/commands/cliproxy-command.ts`
- `ccs config --help`: `src/commands/config-command.ts`
- `ccs cursor --help`: `src/commands/help-command.ts`
- `ccs doctor --help`: `src/commands/doctor-command.ts`
- `ccs docker --help`: `src/commands/docker/help-subcommand.ts`
- `ccs env --help`: `src/commands/env-command.ts`
- `ccs migrate --help`: `src/commands/migrate-command.ts`
- `ccs persist --help`: `src/commands/persist-command.ts`
- `ccs setup --help`: `src/commands/setup-command.ts`

## Validation

Format before validating:

```bash
cd /Users/kaitran/CloudPersonal/ccs/cli && bun run format
cd /Users/kaitran/CloudPersonal/ccs/cli && bun run lint:fix
cd /Users/kaitran/CloudPersonal/ccs/cli && bun run validate
```

Before requesting review or merge, run:

```bash
cd /Users/kaitran/CloudPersonal/ccs/cli && bun run validate:ci-parity
```

If UI changed:

```bash
cd /Users/kaitran/CloudPersonal/ccs/cli/ui && bun run format && bun run validate
```

After every push to a PR, watch CI until it finishes. If checks fail, inspect
logs, fix root cause, push again, and re-watch.

## Issue Triage

Issue triage is GitHub-only unless implementation is explicitly requested.
Always inspect live state first:

```bash
cd /Users/kaitran/CloudPersonal/ccs/cli && gh issue view <number> --json title,body,state,labels,assignees,comments
```

For open issues, prefer one type label and one area label. Use routing labels
only when they affect handling: `upstream-blocked`, `needs-repro`,
`needs-split`, `docs-gap`. Do not close issues on age, intuition, or vague
titles; close only with evidence from README, docs, changelog, source, or a
canonical duplicate.

## Release Signals

- PR `CI` is the contributor quality gate.
- `Push CI` is the post-merge signal for `main`.
- A red `Push CI` is not automatically contributor failure; check PR `CI`
  first.

Use `feat:` or `fix:` for main promotion PRs so release automation runs.

## Design Standards

- YAGNI, KISS, DRY.
- CLI-complete: core configuration features need CLI coverage.
- Dashboard parity: configuration features usually need dashboard coverage too.
- Execution remains CLI-first; dashboard should not replace terminal profile
  launch flows.
- Error messages should help users recover, not just report failure.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/marlon-costa-dc/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
