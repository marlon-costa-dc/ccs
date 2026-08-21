# CCS Release Process

CCS uses a single stable release lane. A merge to `main` starts semantic-release,
which owns package version, changelog, npm publish, tag, and GitHub release.
Tag-driven packaging is a downstream consumer of those semantic-release artifacts.

## Release lanes

| Source | Workflow | Result |
| --- | --- | --- |
| Merge to `main` | [`dev-release.yml`](../.github/workflows/dev-release.yml) | Semantic-release stable version, npm `@latest`, tag, and GitHub release when commits require a release |
| Published stable or `rc` GitHub release | [`docker-release.yml`](../.github/workflows/docker-release.yml) | Immutable integrated Docker version tag, signature, and smoke test |
| Manual stable promotion | [`promote-release.yml`](../.github/workflows/promote-release.yml) | Docker `:latest`, major, and minor aliases |

## Stable npm and GitHub releases

`Semantic Release` runs on pushes to `main`. After build and validation gates, it
invokes semantic-release with [`.releaserc.cjs`](../.releaserc.cjs).

Semantic-release analyzes commits since the previous stable release:

- `feat` produces at least a minor release;
- `fix`, `hotfix`, `refactor`, and `style` produce patch releases under the
  repository rules;
- breaking-change notation produces the appropriate major release; and
- commits without a matching release rule may produce no release.

When a release is required, the lane updates `CHANGELOG.md` and `package.json`,
publishes npm `@latest`, creates the stable Git tag and GitHub release, and
pushes the generated release commit to `main`. Do not bump versions or create
release tags manually.

## Docker publication and promotion

The supported integrated image is `ghcr.io/kaitranntt/ccs`.

On a published stable `vX.Y.Z` or release-candidate `vX.Y.Z-rc.N` GitHub
release, `Publish Docker Image`:

1. validates the release tag;
2. checks out that tag;
3. builds the integrated image for `linux/amd64` and `linux/arm64`;
4. publishes only the matching immutable version tag;
5. signs the image digest with keyless cosign; and
6. smoke-tests the published image.

Mutable aliases are a separate operator decision. After verifying the immutable
image and allowing the desired soak period, dispatch `promote-release.yml`:

```bash
gh workflow run promote-release.yml --field tag=vX.Y.Z
```

The promotion workflow verifies that the stable GitHub release and immutable
image exist, then dispatches `docker-release.yml` with
`promote_to_latest=true`. The promotion job creates `:latest`, `:X`, and
`:X.Y` aliases from the immutable image digest.

The deprecated `ccs-dashboard` image has its own sunset compatibility job.
Do not use its tag behavior as the contract for the supported integrated image.

## Verification

```bash
# npm channels
npm view @kaitranntt/ccs dist-tags

# immutable integrated image
docker buildx imagetools inspect ghcr.io/kaitranntt/ccs:X.Y.Z

# mutable alias after promotion
docker buildx imagetools inspect ghcr.io/kaitranntt/ccs:latest
```

Verify the GitHub Actions run and tag point to the expected commit before
announcing a release.

## Recovery

- **Bad npm release:** publish a corrected patch. Do not unpublish a version
  used by downstream consumers.
- **Bad immutable Docker image:** leave the immutable tag unchanged and publish
  a corrected version.
- **Bad mutable Docker promotion:** promote a known-good immutable digest back
  to the mutable aliases through the controlled workflow.

## Branch and tag summary

| Branch | Package channel | npm dist-tag | Integrated Docker |
| --- | --- | --- | --- |
| `main` | Stable semantic release | `@latest` | Immutable tag on GitHub release; mutable aliases after manual promotion |
