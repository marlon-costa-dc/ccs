/**
 * Configuration Health Checks - Config files and Claude settings
 */

import * as fs from 'fs';
import * as path from 'path';
import { ok, fail, warn, info } from '../../utils/ui';
import { HealthCheck, IHealthChecker, createSpinner } from './types';

import { getClaudeConfigDir } from '../../utils/claude-config-path';
import { getCcsDir } from '../../config/config-loader-facade';
import {
  getConfigYamlPath,
  withConfigWriteLock,
  writeConfigYamlContentWithLockHeld,
} from '../../config/loader/io-locks';
import { parseModelPipelineConfig } from '../../config/schemas/model-pipeline';
import {
  CODEX_TRANSLATOR_URL_MARKER,
  findCodexTranslatorUrlPaths,
  formatSettingsPathList,
} from '../../shared/stale-codex-translator-settings';

const ora = createSpinner();

/**
 * Parser message for a `model_pipeline` block the config loader rejects, or
 * null when the document has no such block or the block loads.
 */
function unloadableModelPipelineReason(document: unknown): string | null {
  if (typeof document !== 'object' || document === null) return null;
  const block = (document as Record<string, unknown>).model_pipeline;
  if (block === undefined) return null;
  try {
    parseModelPipelineConfig(block);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

function describeClearedModelPipeline(block: unknown): string {
  const receipt = (block as { receipt?: unknown } | null)?.receipt;
  const active = (receipt as { active?: unknown } | null | undefined)?.active as
    | { generation?: unknown; snapshot_digest?: unknown }
    | null
    | undefined;
  if (typeof active?.generation === 'number' && typeof active.snapshot_digest === 'string') {
    return `generation ${active.generation}, snapshot_digest ${active.snapshot_digest}`;
  }
  return 'unparseable block (no readable receipt.active identity)';
}

/** Result of {@link clearUnloadableModelPipeline}. */
export type ModelPipelineClearOutcome =
  | { kind: 'config-absent' }
  | { kind: 'block-loadable' }
  | { kind: 'cleared'; cleared: string };

/**
 * Offline equivalent of the publisher's reset for a `model_pipeline` block the
 * config loader rejects: the dashboard cannot start to serve the typed reset
 * while config.yaml fails to load. Removes only the `model_pipeline` key, under
 * the config write lock, through the same atomic writer as every config write.
 */
export function clearUnloadableModelPipeline(): ModelPipelineClearOutcome {
  return withConfigWriteLock((): ModelPipelineClearOutcome => {
    const yaml = require('js-yaml');
    const yamlPath = getConfigYamlPath();
    if (!fs.existsSync(yamlPath)) return { kind: 'config-absent' };
    const document: unknown = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
    if (unloadableModelPipelineReason(document) === null) return { kind: 'block-loadable' };
    const { model_pipeline: block, ...remaining } = document as Record<string, unknown>;
    writeConfigYamlContentWithLockHeld(
      yaml.dump(remaining, { indent: 2, lineWidth: -1, quotingType: '"' })
    );
    return { kind: 'cleared', cleared: describeClearedModelPipeline(block) };
  });
}

/** One operator-facing line for a {@link ModelPipelineClearOutcome}. */
export function describeModelPipelineClearOutcome(outcome: ModelPipelineClearOutcome): string {
  switch (outcome.kind) {
    case 'config-absent':
      return 'config.yaml does not exist; nothing was changed';
    case 'block-loadable':
      return 'config.yaml has no unloadable model_pipeline block; nothing was changed';
    case 'cleared':
      return `Cleared unloadable model_pipeline from config.yaml: ${outcome.cleared}`;
  }
}

/**
 * Check CCS config files exist and are valid
 * - Prefers config.yaml (v2) over config.json (legacy)
 * - Settings files are optional (only checked if profile exists)
 */
export class ConfigFilesChecker implements IHealthChecker {
  name = 'Config Files';
  private readonly ccsDir: string;

  constructor() {
    this.ccsDir = getCcsDir();
  }

  run(results: HealthCheck): void {
    const { DelegationValidator } = require('../../utils/delegation-validator');

    // Check main config file (yaml preferred, json fallback)
    this.checkMainConfig(results);

    // Check optional settings files (only if profile exists in config)
    this.checkOptionalSettingsFiles(results, DelegationValidator);
  }

  /**
   * Check main configuration file (config.yaml preferred, config.json fallback)
   */
  private checkMainConfig(results: HealthCheck): void {
    const configYamlPath = path.join(this.ccsDir, 'config.yaml');
    const configJsonPath = path.join(this.ccsDir, 'config.json');

    const yamlExists = fs.existsSync(configYamlPath);
    const jsonExists = fs.existsSync(configJsonPath);

    // Check config.yaml first (preferred format)
    if (yamlExists) {
      const spinner = ora('Checking config.yaml').start();
      try {
        const yaml = require('js-yaml');
        const content = fs.readFileSync(configYamlPath, 'utf8');
        const pipelineReason = unloadableModelPipelineReason(yaml.load(content));
        if (pipelineReason !== null) {
          spinner.fail();
          console.log(`  ${fail('config.yaml'.padEnd(22))}  Unloadable model_pipeline`);
          results.addCheck(
            'config.yaml',
            'error',
            `Unloadable model_pipeline block: ${pipelineReason}`,
            'Run: ccs doctor --fix-model-pipeline (clears only that block; republish afterwards)',
            { status: 'ERROR', info: 'Unloadable model_pipeline' }
          );
          return;
        }
        spinner.succeed();
        console.log(`  ${ok('config.yaml'.padEnd(22))}  Valid`);
        results.addCheck('config.yaml', 'success', undefined, undefined, {
          status: 'OK',
          info: 'Valid',
        });

        // Inform if legacy config.json also exists (purely informational, not a check)
        if (jsonExists) {
          console.log(`  ${info('config.json'.padEnd(22))}  Legacy (ignored)`);
        }
        return;
      } catch (e) {
        spinner.fail();
        console.log(`  ${fail('config.yaml'.padEnd(22))}  Invalid YAML`);
        // First line only: the parser message embeds a multi-line snippet the
        // loader already printed, so keep the ERRORS entry to a single line.
        const reason = (e as Error).message.split('\n')[0].trim();
        results.addCheck(
          'config.yaml',
          'error',
          `Invalid YAML: ${reason}`,
          `Backup and recreate: mv ${configYamlPath} ${configYamlPath}.backup && npm install -g @kaitranntt/ccs --force`,
          { status: 'ERROR', info: 'Invalid YAML' }
        );
        return;
      }
    }

    // Fallback to config.json (legacy format)
    if (jsonExists) {
      const spinner = ora('Checking config.json').start();
      try {
        const content = fs.readFileSync(configJsonPath, 'utf8');
        JSON.parse(content);
        spinner.succeed();
        console.log(`  ${ok('config.json'.padEnd(22))}  Valid (legacy)`);
        results.addCheck('config.json', 'success', undefined, undefined, {
          status: 'OK',
          info: 'Valid (legacy)',
        });
      } catch (e) {
        spinner.fail();
        console.log(`  ${fail('config.json'.padEnd(22))}  Invalid JSON`);
        results.addCheck(
          'config.json',
          'error',
          `Invalid JSON: ${(e as Error).message}`,
          `Backup and recreate: mv ${configJsonPath} ${configJsonPath}.backup && npm install -g @kaitranntt/ccs --force`,
          { status: 'ERROR', info: 'Invalid JSON' }
        );
      }
      return;
    }

    // Neither exists - error
    const spinner = ora('Checking config').start();
    spinner.fail();
    console.log(`  ${fail('config.yaml'.padEnd(22))}  Not found`);
    results.addCheck(
      'config.yaml',
      'error',
      'No configuration file found (config.yaml or config.json)',
      'Run: npm install -g @kaitranntt/ccs --force',
      { status: 'ERROR', info: 'Not found' }
    );
  }

  /**
   * Check optional settings files (only if corresponding profile is configured)
   * These files are NOT required - they're only created when user configures a profile
   */
  private checkOptionalSettingsFiles(
    results: HealthCheck,
    DelegationValidator: { validate: (profile: string) => { valid: boolean; error?: string } }
  ): void {
    // Settings files to check (only if profile exists)
    const settingsFiles = [
      { name: 'glm.settings.json', profile: 'glm', displayName: 'GLM Settings' },
      { name: 'kimi.settings.json', profile: 'kimi', displayName: 'Kimi Settings' },
      { name: 'poolside.settings.json', profile: 'poolside', displayName: 'Poolside Settings' },
      { name: 'opencode.settings.json', profile: 'opencode', displayName: 'OpenCode Settings' },
    ];

    for (const file of settingsFiles) {
      const filePath = path.join(this.ccsDir, file.name);
      const exists = fs.existsSync(filePath);

      if (!exists) {
        // Not an error - these are optional files
        // Only show info if user might expect them
        continue;
      }

      // File exists - validate it
      const spinner = ora(`Checking ${file.name}`).start();
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        JSON.parse(content);

        // Check if API key is properly configured
        const validation = DelegationValidator.validate(file.profile);

        let fileInfo = 'Valid JSON';
        let status: 'OK' | 'WARN' = 'OK';

        if (validation.valid) {
          fileInfo = 'Key configured';
          status = 'OK';
        } else if (validation.error && validation.error.includes('placeholder')) {
          fileInfo = 'Placeholder key';
          status = 'WARN';
        }

        if (status === 'WARN') {
          spinner.warn();
          console.log(`  ${warn(file.name.padEnd(22))}  ${fileInfo}`);
        } else {
          spinner.succeed();
          console.log(`  ${ok(file.name.padEnd(22))}  ${fileInfo}`);
        }

        results.addCheck(file.name, status === 'OK' ? 'success' : 'warning', undefined, undefined, {
          status: status,
          info: fileInfo,
        });
      } catch (e) {
        spinner.fail();
        console.log(`  ${fail(file.name.padEnd(22))}  Invalid JSON`);
        results.addCheck(
          file.name,
          'error',
          `Invalid JSON: ${(e as Error).message}`,
          `Backup and recreate: mv ${filePath} ${filePath}.backup`,
          { status: 'ERROR', info: 'Invalid JSON' }
        );
      }
    }
  }
}

/**
 * Check Claude settings.json
 */
export class ClaudeSettingsChecker implements IHealthChecker {
  name = 'Claude Settings';
  private readonly claudeDir: string;

  constructor() {
    this.claudeDir = getClaudeConfigDir();
  }

  run(results: HealthCheck): void {
    const spinner = ora('Checking ~/.claude/settings.json').start();
    const settingsPath = path.join(this.claudeDir, 'settings.json');
    const settingsName = '~/.claude/settings.json';

    if (!fs.existsSync(settingsPath)) {
      spinner.warn();
      console.log(`  ${warn(settingsName.padEnd(22))}  Not found`);
      results.addCheck(
        'Claude Settings',
        'warning',
        '~/.claude/settings.json not found',
        'Run: claude /login'
      );
      return;
    }

    // Validate JSON
    try {
      const content = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(content) as unknown;
      const codexTranslatorUrlPaths = findCodexTranslatorUrlPaths(settings);
      if (codexTranslatorUrlPaths.length > 0) {
        const formattedPaths = formatSettingsPathList(codexTranslatorUrlPaths);
        spinner.warn();
        console.log(
          `  ${warn(settingsName.padEnd(22))}  Codex CLIProxy bridge persisted at ${formattedPaths}`
        );
        results.addCheck(
          'Claude Settings',
          'warning',
          `Claude settings route Claude Code through the Codex CLIProxy translator at ${formattedPaths} (${CODEX_TRANSLATOR_URL_MARKER})`,
          'Run: ccs persist default --yes; use ccsxp or ccs codex --target codex for Codex'
        );
        return;
      }
      spinner.succeed();
      console.log(`  ${ok(settingsName.padEnd(22))}  Valid`);
      results.addCheck('Claude Settings', 'success');
    } catch (e) {
      spinner.warn();
      console.log(`  ${warn(settingsName.padEnd(22))}  Invalid JSON`);
      results.addCheck(
        'Claude Settings',
        'warning',
        `Invalid JSON: ${(e as Error).message}`,
        'Run: claude /login'
      );
    }
  }
}

/**
 * Run all config checks
 */
export function runConfigChecks(results: HealthCheck): void {
  const configChecker = new ConfigFilesChecker();
  const claudeChecker = new ClaudeSettingsChecker();

  configChecker.run(results);
  claudeChecker.run(results);
}
