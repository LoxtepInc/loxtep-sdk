/**
 * Stable fingerprint for a directory person. Never includes secrets.
 */

import { hashFingerprintMaterial } from '../../connect/discovery/fingerprint.js';

export function directoryPersonFingerprint(email: string, source: string): string {
  const normalized = `${email.trim().toLowerCase()}|${source.trim().toLowerCase()}`;
  return hashFingerprintMaterial(normalized);
}
