'use strict';

// Exercise the native build in an actual Node process. Compile only the test
// fixture below; dependencies and dashboard stay real.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const repo = path.resolve(__dirname, '../../../..');
const parsed = ts.readConfigFile(path.join(repo, 'tsconfig.json'), ts.sys.readFile);
if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
const options = ts.convertCompilerOptionsFromJson(parsed.config.compilerOptions, repo).options;
require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: options,
    fileName: filename,
    reportDiagnostics: true,
  });
  if (compiled.diagnostics?.length) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(compiled.diagnostics, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => repo,
        getNewLine: () => '\n',
      })
    );
  }
  module._compile(compiled.outputText, filename);
};

const { startServer } = require('../../../../dist/web-server/index.js');
const {
  stopAutoSyncWatcher,
  getAutoSyncStatus,
} = require('../../../../dist/cliproxy/sync/auto-sync-watcher.js');
const { createEmptyUnifiedConfig } = require('../../../../dist/config/schemas/unified-config.js');
const {
  loadOrCreateUnifiedConfig,
  saveConfig,
  mutateConfig,
  getCcsDir,
} = require('../../../../dist/config/config-loader-facade.js');
const {
  regenerateConfig,
  getCliproxyConfigPath,
} = require('../../../../dist/cliproxy/config/index.js');
const {
  modelPipelineConfigFixture,
} = require('../../../../src/config/schemas/__tests__/fixtures/model-pipeline-v3-fixture.ts');
const { parseModelPipelineConfig } = require('../../../../dist/config/schemas/model-pipeline.js');
const {
  replaceModelPipeline,
} = require('../../../../dist/cliproxy/services/model-pipeline-publisher.js');
const {
  canonicalJsonSha256Digest,
  sha256Digest,
} = require('../../../../dist/utils/canonical-json.js');
const yaml = require('js-yaml');

const scenario = process.argv[2];
const ccsDir = getCcsDir();
const configPath = path.join(ccsDir, 'config.yaml');
const settingsPath = path.join(ccsDir, 'fixture.settings.json');
const profile = {
  settings: settingsPath,
  target: scenario === 'unrelated-settings' ? 'codex' : 'claude',
};
let dashboard;
let reserved;
let initialBytes;
let rawConfigPath;

function nextPipeline(current) {
  const next = modelPipelineConfigFixture();
  if (current) {
    next.snapshot.generation = current.snapshot.generation + 1;
    next.snapshot.inventory.active = current.receipt.active;
    next.snapshot.inventory.activation_loaded_at = current.receipt.loaded_at;
    const { snapshot_digest: _previous, ...semantic } = next.snapshot;
    next.snapshot.snapshot_digest = canonicalJsonSha256Digest(semantic);
    next.receipt.previous_active = current.receipt.active;
    next.receipt.active.generation = next.snapshot.generation;
    next.receipt.active.snapshot_digest = next.snapshot.snapshot_digest;
  }
  return parseModelPipelineConfig(next);
}

function publish(current) {
  replaceModelPipeline(
    current,
    nextPipeline(current.model_pipeline),
    current.model_pipeline?.receipt.active ?? null
  );
}

async function main() {
  fs.mkdirSync(ccsDir, { recursive: true });
  reserved = http.createServer((_req, res) => res.writeHead(503).end());
  await new Promise((resolve) => reserved.listen(0, '127.0.0.1', resolve));
  const config = createEmptyUnifiedConfig();
  config.cliproxy.auto_sync = true;
  config.cliproxy_server.local.port = reserved.address().port;
  config.cliproxy_server.remote.enabled = false;
  config.profiles.fixture = profile;
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'fixture-owned-token',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${reserved.address().port}`,
        ANTHROPIC_MODEL: 'fixture-before',
      },
    })
  );
  // Start from a sparse document. Canonical persistence expands defaults, but
  // that must not turn a publication-only transaction into a profile edit.
  fs.writeFileSync(
    configPath,
    yaml.dump({
      version: config.version,
      profiles: config.profiles,
      cliproxy: { auto_sync: true },
      cliproxy_server: config.cliproxy_server,
    })
  );
  rawConfigPath = regenerateConfig(
    reserved.address().port,
    ['settings-format', 'active-settings'].includes(scenario)
      ? { configPath: getCliproxyConfigPath() }
      : undefined
  );
  initialBytes = fs.readFileSync(rawConfigPath, 'utf8');
  if (['receipt', 'mixed', 'invalid', 'invalid-backend', 'active-settings', 'unrelated-settings'].includes(scenario)) {
    mutateConfig(publish);
  }
  dashboard = await startServer({ port: 0, host: '127.0.0.1' });
  process.send({
    kind: 'ready',
    port: dashboard.server.address().port,
    node: process.version,
    rawConfigPath,
    rawConfigDigest: sha256Digest(Buffer.from(initialBytes)),
  });
}

process.on('message', async (command) => {
  if (command === 'change') {
    if (['settings-format', 'active-settings', 'unrelated-settings'].includes(scenario)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings.env.ANTHROPIC_MODEL = 'fixture-after';
      fs.writeFileSync(settingsPath, JSON.stringify(settings));
      process.send({ kind: 'settings-written' });
      return;
    }
    if (scenario === 'invalid-backend') {
      const current = structuredClone(loadOrCreateUnifiedConfig());
      current.cliproxy.backend = 'invalid-backend';
      fs.writeFileSync(configPath, yaml.dump(current));
    } else if (scenario === 'invalid') {
      const current = structuredClone(loadOrCreateUnifiedConfig());
      current.model_pipeline.receipt.active.snapshot_digest = 'invalid-digest';
      fs.writeFileSync(configPath, yaml.dump(current));
    } else if (scenario === 'format') {
      const current = loadOrCreateUnifiedConfig();
      fs.writeFileSync(
        configPath,
        yaml.dump(Object.fromEntries(Object.entries(current).reverse()))
      );
    } else {
      mutateConfig((current) => {
        if (scenario !== 'legacy') publish(current);
        if (scenario === 'mixed' || scenario === 'legacy') {
          current.cliproxy.logging = { ...current.cliproxy.logging, request_log: true };
        }
      });
    }
  } else if (command === 'format') {
    saveConfig(loadOrCreateUnifiedConfig());
  } else if (command === 'inspect') {
    const current = loadOrCreateUnifiedConfig();
    const bytes = fs.readFileSync(rawConfigPath, 'utf8');
    process.send({
      kind: 'state',
      status: getAutoSyncStatus(),
      profile: current.profiles.fixture,
      expectedProfile: profile,
      pipeline: current.model_pipeline,
      unchanged: bytes === initialBytes,
      hasUpdatedModel: bytes.includes('fixture-after'),
      requestLogging: bytes.includes('request-log: true'),
    });
  } else if (command === 'stop') {
    await stopAutoSyncWatcher();
    dashboard.cleanup();
    await Promise.all([
      new Promise((resolve) => dashboard.wss.close(resolve)),
      new Promise((resolve) => dashboard.server.close(resolve)),
      new Promise((resolve) => reserved.close(resolve)),
    ]);
    process.disconnect();
  }
});

void main().catch((error) => {
  setImmediate(() => {
    throw error;
  });
});
