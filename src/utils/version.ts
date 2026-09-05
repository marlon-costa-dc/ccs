/**
 * Version Utility
 *
 * Centralized version and immutable build provenance for CCS.
 */

import { BUILD_PROVENANCE } from '../generated/build-provenance';

export interface BuildProvenance {
  readonly version: string;
  readonly commit: string;
  readonly built_at: string;
}

export function getVersion(): string {
  return BUILD_PROVENANCE.version;
}

export function getBuildProvenance(): BuildProvenance {
  return BUILD_PROVENANCE;
}
