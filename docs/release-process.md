# CCS Release Process

This fork keeps `main` as an exact mirror of `kaitranntt/ccs`, isolates every
datacosmos/ai-hub change on `datacosmos`, and publishes the integrated
`dc-use` branch as stable `<upstream-version>-dc.N` releases. Upstream
contributions stay on separate branches and never contain datacosmos code.

## Branch roles

| Branch | Role | Writers |
| --- | --- | --- |
| `main` | exact `upstream/main` mirror; no fork commits | `sync-upstream` |
| `datacosmos` | datacosmos/ai-hub-specific code and automation | reviewed PRs |
| `dc-use` (default) | `main + datacosmos` integration and consumption line | `integrate-dc-use` |
| `upstream/<topic>` | one real upstream contribution | PRs to `kaitranntt/ccs` (base `dev`) |

Third-party code and forks are preserved and pinned: `CLIProxyAPIPlus`, the
`marlon-costa-dc/cliproxy` fork, and the
`marlon-costa-dc/Cli-Proxy-API-Management-Center` fork, including its
`plus`/`datacosmos/ai-hub`/`dc-use` branches. They are never deleted, vendored
over, or replaced by a datacosmos copy.

## Release lanes

| Trigger | Workflow | Result |
| --- | --- | --- |
| Schedule (every 6h) or dispatch | [`sync-upstream.yml`](../.github/workflows/sync-upstream.yml) | Fast-forward `main` to `upstream/main`; dispatch integration |
| Schedule, dispatch or datacosmos push | [`integrate-dc-use.yml`](../.github/workflows/integrate-dc-use.yml) | Merge `main + datacosmos`, run the full gates, push `dc-use`, dispatch release |
| Dispatch from integration | [`release-dc-use.yml`](../.github/workflows/release-dc-use.yml) | Stable `v<upstream>-dc.N` tag, package asset and checksums, `--latest` release |
| Push to `datacosmos` | [`dispatch-dc-use-integration.yml`](../.github/workflows/dispatch-dc-use-integration.yml) | Dispatch the integration workflow |

Scheduled workflows live on the default branch (`dc-use`) because GitHub
schedules only from the default branch. `main` stays a pure mirror.

## Versioning

- `UPSTREAM_VERSION` is read from `origin/main/package.json` (currently
  `8.11.0`).
- `RELEASE_VERSION` is `<UPSTREAM_VERSION>-dc.N`, where `N` is one greater than
  the highest existing `v<UPSTREAM_VERSION>-dc.*` tag. The first release is
  `v8.11.0-dc.1`.
- `release-dc-use` sets the package version, creates the tag on the verified
  `dc-use` SHA, and publishes a stable GitHub release (`isPrerelease: false`,
  `isLatest: true`).
- `fd.*` releases are historical. Semantic-release, `.releaserc.cjs`, and
  manual version bumps are retired; no other surface creates a package release.

## Gates

The integration and release workflows run, on the exact candidate SHA:

```bash
bash scripts/ensure-deps.sh
bun run build:all
bun run validate
bun run validate:ci-parity
(cd ui && bun run validate)
```

A conflict, failing gate, or already-existing tag stops the flow, opens an
automation issue with the run URL, and never force-pushes or auto-resolves.

## Assets and verification

`release-dc-use` builds `ccs_<version>_package.tar.gz` and
`ccs_<version>_checksums.txt`. The packer follows `package.json files`,
materializes `VERSION` from `RELEASE_VERSION`, skips package lifecycle scripts,
and bundles production dependencies with the committed lockfile.

```bash
gh release view v8.11.0-dc.1 --repo marlon-costa-dc/ccs \
  --json isPrerelease,isLatest,assets
sha256sum -c ccs_8.11.0-dc.1_checksums.txt
MISE_DATA_DIR=$(mktemp -d) HOME=$(mktemp -d) \
  mise install github:marlon-costa-dc/ccs@8.11.0-dc.1
ccs --version
```

## Upstream contributions

Cut one branch per subject from `upstream/main`, open a PR to
`kaitranntt/ccs` (base `dev`), and run the upstream gates. Do not include
datacosmos automation, provider catalogs, release assets, or ai-hub code.
When upstream accepts a change, `sync-upstream` brings it to `main` and the
datacosmos delta shrinks.

## ai-hub boundary and live cutover

ai-hub uses CCS as-is. No ai-hub model-pipeline endpoint, schema, or policy
returns to CCS. The ai-hub owner retires its failed `ai-hub-model-pipeline`
unit and removes its publication consumer.

Before installing a new dc release in ai-hub:

1. back up `~/.ccs/config.yaml`, `~/.ccs/cliproxy/config.yaml` and any pending
   model-pipeline intent;
2. stop `ccs-dashboard`, remove the stale intent, and remove the
   `model_pipeline` block and `profiles.poolside*` with a formatting-preserving
   YAML edit (validate with a YAML parser);
3. install the dc release and `mise reshim`;
4. start `ccs-cliproxy` and `ccs-dashboard`, verify active units, port 8317,
   dashboard `:3184`, `ccs doctor`, and a 404 for
   `/api/config/model-pipeline`;
5. record the command/exit/output evidence and the ai-hub unit state in the
   bead and coordination thread.

## Recovery

- Bad asset: publish a new `dc.N` release; never overwrite an immutable tag.
- Bad integration: revert the merge with a new commit on `dc-use`; never reset
  or force-push a shared branch without a preserved tag.
- Restore `main` from `dc-legacy-20261114` only as a last resort, and only when
  the mirror job cannot repair the branch.
- The `fd.*` releases remain available for rollback; the previous dc release is
  the preferred rollback target.
