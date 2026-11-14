# Fork delta and maintenance contract

This fork tracks `kaitranntt/ccs` and exists only to run the upstream CLI in the
operator's environment. Upstream is the functional source of truth; this file
records every deliberate difference and the rules that keep the delta small.

## Approved delta

1. **Fork metadata**: `homepage`, `bugs` and `repository` point at
   `marlon-costa-dc/ccs`.
2. **Release channel**: `semantic-release.yml` cuts `8.9.0-fd.N` prereleases on
   `main`; `release.yml` packages `ccs_<version>_package.tar.gz` and checksums
   for the GitHub release. Both run on GitHub-hosted runners because the fork
   has no self-hosted runner; actions are pinned to full commit SHAs and the
   locked `./node_modules/.bin/semantic-release` is used. The packaging lane is
   `main`-only; `dc-use` is a stale lane and is not a release surface.
3. **Launcher and packaging**: `bin/ccs` and `scripts/build-release-asset.sh`
   execute the shipped `dist/` plus bundled `node_modules` from the release
   tarball; `package.json` `files` covers the declared bundle, including
   upstream `claude-mods/`.
4. **Build provenance**: `scripts/generate-build-provenance.js` writes the
   ignored `src/generated/build-provenance.ts` and records the version, commit
   and build time in the bundle. The hardening-inventory and maintainability
   walkers exclude generated directories so the committed inventory matches a
   clean CI checkout.
5. **Provider delta**: first-class `opencode`, `opencode-go` and `zai`
   providers remain because the operator runs them natively. Their base model
   configs live in `config/base-opencode.settings.json`,
   `config/base-opencode-go.settings.json` and `config/base-zai.settings.json`.
   They are candidates for upstream provider PRs; they are not ai-hub-specific.
6. **Tooling/docs**: `.mise.toml`, `.pr_agent.toml`, the `.husky` pre-push
   gate, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/release-process.md`, `CHANGELOG`
   and the `bun.lock` (`overrides.mime`) carry the fork's release and local
   workflow.
7. **Local state**: `.beads/`, `.gc/` and `src/generated/` are ignored; tracked
   agent copies, stale beads exports and the six-file i18n split were removed.

## Removed from the fork

- The ai-hub `model_pipeline` contract (schema, parser, publisher, transaction
  store, routing projector, web routes, UI card, tests, fixtures, generator
  hooks). CCS exposes no `/api/config/model-pipeline` endpoint and no ai-hub
  domain code. ai-hub uses CCS as-is or keeps its policy in its own domain.
- The dead Poolside provider (union, capabilities, catalog, auth, AI-provider
  family, CLI/UI, tests, docs, i18n).
- All upstream files, tests and workflows the fork had deleted (copilot,
  cursor, pool routing, retry, proxy resolver, release workflows). They are
  restored and follow upstream again.

## Critique (what went wrong and is now fixed)

1. **Domain violation (severe)**: ~6k LOC of ai-hub model-pipeline code lived
   inside CCS and forced an ai-hub-specific endpoint into a third-party CLI.
   Removed; ai-hub keeps its own policy.
2. **Upstream drift (severe)**: the fork had deleted maintained upstream
   features/tests, reaching 552 files and +43,746/-57,633 against upstream.
   Restored; the tree delta is now the approved set only.
3. **Security lag**: the fork sat on 8.9.0 while upstream 8.10/8.11 shipped
   security and robustness fixes. Merged to 8.11.0; no selective
   cherry-picking.
4. **Unnecessary i18n rewrite**: 16,420 lines were split into six JSON files
   although upstream already ships `pt-BR`. Reverted.
5. **Fork-only provider inventions**: first-class providers were added instead
   of upstream API Profiles. ZAI/OpenCode are kept as live provider deltas
   pending upstream PRs; Poolside is removed.
6. **Release duplication**: release workflows were rewritten with unpinned
   actions, `npx` at runtime and a stale `dc-use` lane. Hardened, pinned,
   main-only, with the locked semantic-release binary.
7. **Repository/live-state hygiene**: the main clone carried a staged
   `.gc/settings.json`; the live config still carried Poolside and
   model_pipeline state. Local state is ignored; the cutover clears it.
8. **Test debt**: ~20k lines of upstream tests were deleted. Restored; the
   fork adds only the provider, release and hermeticity tests it needs.

## Release and ai-hub cutover contract

- `main` is the integration and release line. A release tag must sit on
  `origin/main`; `dc-use` is not a release surface.
- `semantic-release` owns versions and tags. Do not hand-edit `package.json`
  version or create release tags.
- The release must contain `ccs_<version>_package.tar.gz`; verify it with a
  clean `MISE_DATA_DIR` install and `ccs --version` / `ccs doctor` before
  activation.
- ai-hub must remove its CCS publication consumer and clear the live
  `model_pipeline` block before the new CCS is installed and `ccs-cliproxy`
  restarted. No compatibility shim is added to CCS.
- Rollback: reinstall the previous `fd` release, restore the backed-up
  `~/.ccs/config.yaml`, restart the proxy, and revert the affected merge with a
  new commit (never reset or force-push).

## Upstream contributions

- Open one PR per subject from `upstream/main`, never from fork `main`.
- Current/planned: hermetic runtime tests (`kaitranntt/ccs#1813`), Poolside
  removal, provider additions (opencode/opencode-go/zai), and the portable
  release-asset workflow if maintainers accept it.
- When an upstream PR merges, drop the corresponding fork delta in a follow-up
  upstream merge.
