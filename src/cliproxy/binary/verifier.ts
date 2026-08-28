/**
 * Binary Verifier
 * Handles checksum verification for downloaded binaries.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { ChecksumResult } from '../types';
import { fetchText } from './downloader';

/**
 * Compute SHA256 checksum of file
 */
export function computeChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Parse checksum from checksums.txt content
 */
export function parseChecksum(content: string, binaryName: string): string | null {
  const lines = content.split('\n');
  for (const line of lines) {
    // Format: "hash  filename" or "hash filename"
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === binaryName) {
      return parts[0].toLowerCase();
    }
  }
  return null;
}

/**
 * Verify file checksum against checksums.txt
 */
export async function verifyChecksum(
  filePath: string,
  binaryName: string,
  checksumsUrl: string,
  verbose = false
): Promise<ChecksumResult> {
  // Download checksums.txt
  const checksumsContent = await fetchText(checksumsUrl, verbose);

  // Parse expected checksum
  const expectedHash = parseChecksum(checksumsContent, binaryName);
  if (!expectedHash) {
    throw new Error(`Checksum not found for ${binaryName} in checksums.txt`);
  }

  // Compute actual checksum
  const actualHash = await computeChecksum(filePath);

  return {
    valid: actualHash === expectedHash,
    expected: expectedHash,
    actual: actualHash,
  };
}
