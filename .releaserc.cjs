/**
 * Semantic Release Configuration
 *
 * Main-only configuration:
 * - main branch: Uses production release configuration and GitHub assets
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
// Releasable merges to main create a stable vX.Y.Z GitHub release.
// Docker immutable :<ver> tag is pushed by docker-release.yml on the release: published event.
// Docker mutable :latest/:MAJOR/:MINOR tags require a separate manual promote step — see
// docs/release-process.md and promote-release.yml for the soak + promote procedure.
const config = {
  branches: ['main'],
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
          ':tada: This issue has been resolved in version ${nextRelease.version} :tada:\n\nThe release is available from [GitHub Releases](${releases[0].url}).',
        releasedLabels: ['released'],
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
};

module.exports = config;
