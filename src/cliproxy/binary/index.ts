/**
 * Binary Module - Barrel Export
 * Re-exports all binary management functionality.
 */

// Types
export type { VersionCache, UpdateCheckResult } from './types';
export { VERSION_CACHE_DURATION_MS, VERSION_PIN_FILE, GITHUB_API_LATEST_RELEASE } from './types';

// Downloader
export { downloadFile, downloadWithRetry, fetchText, fetchJson } from './downloader';

// Verifier
export { computeChecksum, parseChecksum, verifyChecksum } from './verifier';

// Version Cache
export {
  getVersionCachePath,
  getVersionPinPath,
  readVersionCache,
  writeVersionCache,
  readInstalledVersion,
  writeInstalledVersion,
  getPinnedVersion,
  savePinnedVersion,
  clearPinnedVersion,
  isVersionPinned,
  migrateVersionPin,
} from './version-cache';

// Version Checker
export { isNewerVersion, fetchLatestVersion, checkForUpdates } from './version-checker';

// Extractor
export { extractTarGz, extractZip, extractArchive } from './extractor';

// Updater
export {
  downloadAndInstall,
  deleteBinary,
  getBinaryPath,
  isBinaryInstalled,
  getBinaryInfo,
  ensureBinary,
} from './updater';
