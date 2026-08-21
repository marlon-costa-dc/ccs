/**
 * Semantic Release Configuration
 *
 * Main-only configuration:
 * - main branch: Uses production release configuration (stable, npm @latest)
 *
 * RC soak window for Docker mutable tags is handled entirely in docker-release.yml:
 * every release event publishes the immutable :<ver> Docker tag immediately;
 * mutable :latest/:MAJOR/:MINOR tags require an explicit operator action via
 * `gh workflow run promote-release.yml -f tag=vX.Y.Z` (workflow_dispatch).
 * npm @latest is always set immediately on stable release — no rc soak needed.
 */

// Shared plugin config
const commitAnalyzer = [
  '@semantic-release/commit-analyzer',
  {
    preset: 'conventionalcommits',
    releaseRules: [
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
// Every merge to main publishes a stable vX.Y.Z release immediately to npm @latest.
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
    '@semantic-release/npm',
    [
      '@semantic-release/github',
      {
        successComment:
          ':tada: This issue has been resolved in version ${nextRelease.version} :tada:\n\nThe release is available on:\n- [npm package (@latest)](https://www.npmjs.com/package/@kaitranntt/ccs)\n- [GitHub release](${releases[0].url})',
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
