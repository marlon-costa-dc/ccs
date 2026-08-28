/**
 * CLIProxy Server Routes - API endpoints for proxy configuration
 *
 * Provides REST endpoints for managing CLIProxyAPI connection settings:
 * - GET /api/cliproxy-server - Get proxy configuration
 * - PUT /api/cliproxy-server - Update proxy configuration
 * - POST /api/cliproxy-server/test - Test remote connection
 */

import { Router, Request, Response } from 'express';

import { createLogger } from '../../services/logging';
import { testConnection } from '../../cliproxy/services/remote-proxy-client';
import { isProxyRunning } from '../../cliproxy/services/proxy-lifecycle-service';
import { DEFAULT_BACKEND } from '../../cliproxy/binary/platform-detector';
import { CliproxyServerConfig } from '../../config/unified-config-types';
import { resolveProxyTarget } from '../../cliproxy/proxy/proxy-target-resolver';
import { ConfigError } from '../../errors/error-types';
import { CLIPROXY_PROVIDER_IDS } from '../../cliproxy/provider-capabilities';
import {
  configNeedsRegeneration,
  getManagementPanelRepository,
  regenerateConfig,
} from '../../cliproxy/config/generator';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../../config/config-loader-facade';

const router = Router();

const logger = createLogger('web-server:routes:cliproxy-server');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readPort(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConfigError(`${path} must be a whole number between 1 and 65535`);
  }
  return value;
}

router.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'CLIProxy server endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

/**
 * GET /api/cliproxy-server - Get proxy configuration
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await loadOrCreateUnifiedConfig();
    resolveProxyTarget(config.cliproxy_server);
    res.json(config.cliproxy_server);
  } catch (error) {
    logger.error('cliproxy_server.route.load_config_failed', 'Failed to load proxy config', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: errorMessage(error) });
  }
});

/**
 * PUT /api/cliproxy-server - Update proxy configuration
 */
router.put('/', (req: Request, res: Response) => {
  try {
    const updates = req.body as Partial<CliproxyServerConfig>;
    const currentConfig = loadOrCreateUnifiedConfig();
    const currentServer = currentConfig.cliproxy_server;
    if (!currentServer) {
      throw new ConfigError(
        'cliproxy_server must exist before applying a partial configuration update'
      );
    }
    const currentLocalPort = readPort(currentServer.local.port, 'cliproxy_server.local.port');
    const requestedLocalPort = updates.local?.port;

    if (
      requestedLocalPort !== undefined &&
      (!Number.isInteger(requestedLocalPort) ||
        requestedLocalPort < 1 ||
        requestedLocalPort > 65535)
    ) {
      res.status(400).json({
        error: 'Invalid local port. Must be an integer between 1 and 65535.',
      });
      return;
    }

    const nextLocalPort = requestedLocalPort === undefined ? currentLocalPort : requestedLocalPort;

    if (nextLocalPort !== currentLocalPort && isProxyRunning()) {
      res.status(409).json({
        error:
          'Proxy is running on the current local port. Stop CLIProxy before changing local.port.',
        proxyRunning: true,
        currentLocalPort,
      });
      return;
    }

    // Atomic read-modify-write — avoids race between load and save
    const updated = mutateConfig((config) => {
      const currentServer = config.cliproxy_server;
      if (!currentServer) {
        throw new ConfigError(
          'cliproxy_server must exist before applying a partial configuration update'
        );
      }
      const nextServer: CliproxyServerConfig = {
        remote: {
          ...currentServer.remote,
          ...updates.remote,
        },
        management_timeout_ms: updates.management_timeout_ms ?? currentServer.management_timeout_ms,
        local: {
          ...currentServer.local,
          ...updates.local,
        },
      };
      resolveProxyTarget(nextServer);
      config.cliproxy_server = nextServer;
    });

    res.json(updated.cliproxy_server);
  } catch (error) {
    logger.error('cliproxy_server.route.save_config_failed', 'Failed to save proxy config', {
      path: req.path,
      method: req.method,
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(error instanceof ConfigError ? 400 : 500).json({ error: errorMessage(error) });
  }
});

/**
 * GET /api/cliproxy-server/backend - Get CLIProxy backend setting
 * @returns {{ backend: 'original' | 'plus', managementPanelRepository: string }} Current backend configuration
 */
router.get('/backend', async (_req: Request, res: Response) => {
  try {
    const config = await loadOrCreateUnifiedConfig();
    res.json({
      backend: config.cliproxy?.backend ?? DEFAULT_BACKEND,
      managementPanelRepository: getManagementPanelRepository(),
    });
  } catch (error) {
    logger.error('cliproxy_server.route.load_backend_failed', 'Failed to load backend config', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Failed to load backend config' });
  }
});

/**
 * PUT /api/cliproxy-server/backend - Update CLIProxy backend setting
 * @param {Object} req.body - Request body
 * @param {'original' | 'plus'} req.body.backend - Backend to switch to
 * @param {boolean} [req.body.force=false] - Force change even if proxy is running
 * @returns {{ backend: 'original' | 'plus', managementPanelRepository: string }} Updated backend configuration
 * @throws {400} Invalid backend value
 * @throws {409} Proxy is running (unless force=true)
 */
router.put('/backend', (req: Request, res: Response) => {
  try {
    const { backend, force } = req.body;
    if (backend !== 'original' && backend !== 'plus') {
      res.status(400).json({ error: 'Invalid backend. Must be "original" or "plus"' });
      return;
    }

    // Pre-flight read: check running state before acquiring write lock
    const currentConfig = loadOrCreateUnifiedConfig();
    const currentBackend = currentConfig.cliproxy?.backend ?? DEFAULT_BACKEND;
    const localPort = readPort(
      currentConfig.cliproxy_server?.local.port,
      'cliproxy_server.local.port'
    );
    if (currentBackend !== backend && isProxyRunning() && !force) {
      res.status(409).json({
        error: 'Proxy is running. Stop proxy first or use force=true to change backend.',
        proxyRunning: true,
        currentBackend,
      });
      return;
    }

    // Atomic write — avoids race between load and save
    mutateConfig((config) => {
      if (!config.cliproxy) {
        config.cliproxy = {
          backend,
          oauth_accounts: {},
          providers: [...CLIPROXY_PROVIDER_IDS],
          variants: {},
        };
      } else {
        config.cliproxy.backend = backend;
      }
    });

    if (configNeedsRegeneration(localPort)) {
      regenerateConfig(localPort);
    }

    res.json({ backend, managementPanelRepository: getManagementPanelRepository() });
  } catch (error) {
    logger.error('cliproxy_server.route.save_backend_failed', 'Failed to save backend config', {
      path: req.path,
      method: req.method,
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    res.status(500).json({ error: 'Failed to save backend config' });
  }
});

/**
 * POST /api/cliproxy-server/test - Test remote proxy connection
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { host, port, protocol, authToken, allowSelfSigned } = req.body;
    const extraKeys = Object.keys(req.body).filter(
      (key) => !['host', 'port', 'protocol', 'authToken', 'allowSelfSigned'].includes(key)
    );
    if (extraKeys.length > 0) {
      res.status(400).json({ error: `Unsupported connection-test field: ${extraKeys[0]}` });
      return;
    }
    if (typeof host !== 'string' || host.trim().length === 0) {
      throw new ConfigError('Remote CLIProxy host is required');
    }
    const explicitPort = readPort(port, 'Remote CLIProxy port');
    if (protocol !== 'http' && protocol !== 'https') {
      throw new ConfigError('Remote CLIProxy protocol must equal http or https');
    }
    if (typeof authToken !== 'string') {
      throw new ConfigError('Remote CLIProxy authToken must be a string');
    }
    if (typeof allowSelfSigned !== 'boolean') {
      throw new ConfigError('Remote CLIProxy allowSelfSigned policy is required');
    }
    const config = await loadOrCreateUnifiedConfig();
    const timeout = resolveProxyTarget(config.cliproxy_server).managementTimeoutMs;

    const status = await testConnection({
      host,
      port: explicitPort,
      protocol,
      authToken,
      allowSelfSigned,
      timeout,
    });

    res.status(status.reachable ? 200 : 502).json(status);
  } catch (error) {
    logger.error(
      'cliproxy_server.route.test_connection_failed',
      'Failed to test remote proxy connection',
      {
        path: req.path,
        method: req.method,
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      }
    );
    res.status(error instanceof ConfigError ? 400 : 502).json({ error: errorMessage(error) });
  }
});

export default router;
