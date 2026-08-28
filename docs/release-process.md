# CCS Release Process

Semantic-release is the sole authority for the CCS package version,
`CHANGELOG.md`, package tag, and package GitHub release. This fork distributes
installable packages through immutable GitHub Release assets and does not
publish the upstream-owned npm package. Release automation runs only after
changes land on `main`.

## Release lanes

| Source | Workflow | Result |
| --- | --- | --- |
| Push to `main` | [`semantic-release.yml`](../.github/workflows/semantic-release.yml) | Build and validation, then semantic-release when commit history requires a release |
| Semantic-release tag or operator replay of an existing tag | [`release.yml`](../.github/workflows/release.yml) | Package assets added to the existing GitHub release after provenance checks |
| Published stable or `rc` GitHub release | [`docker-release.yml`](../.github/workflows/docker-release.yml) | Immutable integrated Docker version tag, signature, and smoke test |
| Operator-approved stable promotion | [`promote-release.yml`](../.github/workflows/promote-release.yml) | Docker `:latest`, major, and minor aliases |
| Operator-dispatched CCS Bar publication | [`bar-release.yml`](../.github/workflows/bar-release.yml) | Floating `ccs-bar-latest` assets; no package version or package tag |

## Package release authority

[`semantic-release.yml`](../.github/workflows/semantic-release.yml) runs on
pushes to `main`. After its build and fast validation gates, it invokes
semantic-release with [`.releaserc.cjs`](../.releaserc.cjs).

The configuration analyzes conventional commits since the previous package
release. `feat` produces at least a minor release; `fix`, `hotfix`, `refactor`,
and `style` produce patch releases under repository rules; breaking-change
notation produces the corresponding major release. The explicit `governance`
scope produces no release, regardless of commit type. Other commits may also
produce no release.

When a release is required, semantic-release updates `CHANGELOG.md` and
`package.json`, creates the package tag and GitHub release, and pushes its
generated commit to `main`. The npm plugin owns package-version preparation
with `npmPublish: false`; it must never require registry credentials. Never bump
a version, create a package tag, or create a package GitHub release manually.

## Downstream package assets

[`release.yml`](../.github/workflows/release.yml) packages an existing
semantic-release tag. Before upload it verifies all of these conditions:

1. the checkout commit is the requested tag commit;
2. the tag commit belongs to `origin/main`;
3. the tag version matches `package.json`; and
4. the non-draft GitHub release already exists.

The workflow builds and validates the tagged source, then uploads versioned
assets without overwriting existing assets. A provenance mismatch or existing
asset fails the workflow. It never creates a release or replaces release
metadata.

## Docker publication and promotion

The supported integrated image is `ghcr.io/kaitranntt/ccs`.

On a published stable `vX.Y.Z` or release-candidate `vX.Y.Z-rc.N` GitHub
release, [`docker-release.yml`](../.github/workflows/docker-release.yml):

1. validates and checks out the release tag;
2. builds the integrated image for `linux/amd64` and `linux/arm64`;
3. publishes only the matching immutable version tag;
4. signs the image digest with keyless cosign; and
5. smoke-tests the published image.

Mutable aliases require an explicit operator decision. After verifying the
immutable image and allowing the desired soak period, dispatch
`promote-release.yml`:

```bash
gh workflow run promote-release.yml --field tag=vX.Y.Z
```

The promotion workflow verifies the stable GitHub release and immutable image,
then dispatches `docker-release.yml` with `promote_to_latest=true`. That job
creates `:latest`, `:X`, and `:X.Y` aliases from the immutable image digest.

The deprecated `ccs-dashboard` image has a sunset compatibility job. Its tag
behavior is not the contract for the supported integrated image.

## CCS Bar assets

`macos-bar/VERSION` owns the version of the separate CCS Bar asset. Bar version
changes land through the normal pull-request workflow. An operator then runs
[`bar-release.yml`](../.github/workflows/bar-release.yml) from `main`.

That workflow is the only publisher for the floating `ccs-bar-latest` release.
Local packaging commands validate the app; they do not upload assets or edit
release metadata.

## Non-publishing maintenance

Documentation and governance-only maintenance must use the `governance` scope
and normally uses a non-releasing conventional commit type, such as
`chore(governance)`. The semantic-release configuration maps that scope to
`release: false`, so a corrective commit in the same lane cannot accidentally
schedule a package release. This path must not dispatch a release workflow,
change a version, create a tag, or publish an artifact. No other surface may
publish on semantic-release's behalf.

## Verification

```bash
gh release view vX.Y.Z --json tagName,targetCommitish,assets
docker buildx imagetools inspect ghcr.io/kaitranntt/ccs:X.Y.Z
docker buildx imagetools inspect ghcr.io/kaitranntt/ccs:latest
```

Before announcing a release, verify the workflow run, package version, tag,
release target, asset checksums, and image digest all identify the same source
commit.

## Recovery

- For a bad package asset, publish a corrected package release. Do not overwrite
  an asset attached to an immutable tag.
- For a bad immutable Docker image, leave its tag unchanged and publish a
  corrected version.
- For a bad mutable Docker promotion, promote a known-good immutable digest
  through the controlled workflow.
