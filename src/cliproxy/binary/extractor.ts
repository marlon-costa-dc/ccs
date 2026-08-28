/**
 * Archive Extractor
 * Facade for tar.gz and zip archive extraction.
 */

import { ArchiveExtension, CLIProxyBackend } from '../types';
import { DEFAULT_BACKEND } from '../binary/platform-detector';
import { extractTarGz } from './tar-extractor';
import { extractZip } from './zip-extractor';

// Re-export for convenience
export { extractTarGz } from './tar-extractor';
export { extractZip } from './zip-extractor';

/**
 * Extract archive based on extension
 */
export async function extractArchive(
  archivePath: string,
  destDir: string,
  extension: ArchiveExtension,
  verbose = false,
  backend: CLIProxyBackend = DEFAULT_BACKEND
): Promise<void> {
  if (extension === 'tar.gz') {
    await extractTarGz(archivePath, destDir, verbose, backend);
  } else {
    await extractZip(archivePath, destDir, verbose, backend);
  }
}
