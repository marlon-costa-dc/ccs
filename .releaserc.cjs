/**
 * Semantic Release Configuration
 *
 * Main-only configuration:
 * - main branch: publishes an immutable GitHub release.
 *
 * RC soak window for Docker mutable tags is handled entirely in docker-release.yml:
 * every release event publishes the immutable :<ver> Docker tag immediately;
 * mutable :latest/:MAJOR/:MINOR tags require an explicit operator action via
 * `gh workflow run promote-release.yml -f tag=vX.Y.Z` (workflow_dispatch).
 */

// Shared plugin config
const commitAnalyzer = [
  '@semantic-release/commit-analyzer',
  {
    preset: 'conventionalcommits',
    releaseRules: [
      { scope: 'governance', release: false },
      { type: 'hotfix', release: 'patch' },
      { type: 'docs', scope: 'README', release: 'patch' },
      { type: 'refactor', release: 'patch' },
      { type: 'style', release: 'patch' },
    ],
  },
];

const releaseNotesGenerator = [
  '@semantic-release/release-notes-generator',
  {
    preset: 'conventionalcommits',
    presetConfig: {
      types: [
        { type: 'feat', section: 'Features' },
        { type: 'fix', section: 'Bug Fixes' },
        { type: 'hotfix', section: 'Hotfixes' },
        { type: 'revert', section: 'Reverts' },
        { type: 'docs', section: 'Documentation' },
        { type: 'style', section: 'Styles' },
        { type: 'refactor', section: 'Code Refactoring' },
        { type: 'perf', section: 'Performance Improvements' },
        { type: 'test', section: 'Tests' },
        { type: 'build', section: 'Build System' },
        { type: 'ci', section: 'CI' },
      ],
    },
  },
];

// Production release configuration
// Branch topology (semantic-release requires at least one release branch that
// EXISTS on the remote, and `lib/branches/expand.js` consumes each remote name
// with the FIRST pattern that matches, so a single branch cannot be both the
// release branch and the prerelease channel):
//   stable -> release branch, reserved for a future stable fork line
//   main   -> prerelease channel `fd` ("fork downstream"), where work lands
// Why a prerelease channel at all: every tag this fork has ever cut is a
// prerelease (v8.9.0-dc1, v8.9.0-dc4) and the declared consumer installs with
// `prerelease: true` (ai-hub config/tools.yaml). Configured as a plain stable
// channel, semantic-release ignores those tags, finds no previous release and
// computes 1.0.0 — a public regression against the published v8.9.0-dc4.
// Why `fd` and not a bare 8.9.0: the un-suffixed version namespace belongs to
// upstream kaitranntt/ccs; this fork only versions inside its own suffix.
// Docker immutable :<ver> tag is pushed by docker-release.yml on the release: published event.
// Docker mutable :latest/:MAJOR/:MINOR tags require a separate manual promote step — see
// docs/release-process.md and promote-release.yml for the soak + promote procedure.
const config = {
  // `channel: false` keeps the released tags on git's default channel. Proven
  // from source: normalize.js does `channel = isNil(channel) ? name : channel`,
  // so omitting it would set channel to "main", while every existing tag carries
  // `channels: [null]`; get-last-release.js then matches nothing via
  // isSameChannel and the fork would restart at 1.0.0.
  branches: [{ name: 'stable' }, { name: 'main', prerelease: 'fd', channel: false }],
  plugins: [
    commitAnalyzer,
    releaseNotesGenerator,
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/github',
      {
        successComment:
          ':tada: This issue has been resolved in version ${nextRelease.version} :tada:\n\nThe release is available on GitHub: ${releases[0].url}',
        releasedLabels: ['released'],
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        // Subject only, no ${nextRelease.notes}. The notes already reach
        // CHANGELOG.md via @semantic-release/changelog and the GitHub release
        // body via @semantic-release/github, so repeating them here is
        // redundant — and it is what broke releases: the accumulated notes hit
        // ~500KB in a single `git commit -m` argv and failed with E2BIG.
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
  ],
};

module.exports = config;
