import * as path from 'path';
import { getCcsDir } from '../config/config-loader-facade';

export const OPENAI_COMPAT_PROXY_LEGACY_DEFAULT_PORT = 3456;
export const OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START = 43_456;
export const OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_END = 43_555;
export const OPENAI_COMPAT_PROXY_DEFAULT_PORT = OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START;
export const OPENAI_COMPAT_PROXY_SERVICE_NAME = 'ccs-openai-compat-proxy';

export function getOpenAICompatProxyDir(): string {
  return path.join(getCcsDir(), 'proxy');
}

export function getOpenAICompatProxyProfileKey(profileName: string): string {
  return encodeURIComponent(profileName.trim());
}

export function getOpenAICompatProxyPidPath(profileName: string): string {
  return path.join(
    getOpenAICompatProxyDir(),
    `${getOpenAICompatProxyProfileKey(profileName)}.daemon.pid`
  );
}

export function getOpenAICompatProxySessionPath(profileName: string): string {
  return path.join(
    getOpenAICompatProxyDir(),
    `${getOpenAICompatProxyProfileKey(profileName)}.session.json`
  );
}

export function getLegacyOpenAICompatProxyPidPath(): string {
  return path.join(getOpenAICompatProxyDir(), 'daemon.pid');
}

export function getLegacyOpenAICompatProxySessionPath(): string {
  return path.join(getOpenAICompatProxyDir(), 'session.json');
}
