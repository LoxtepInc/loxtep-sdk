/**
 * Shared fingerprint hashing — never include secrets in material.
 */

import { createHash } from 'node:crypto';

/**
 * Stable short hash of fingerprint material (no secrets).
 * Adapters build their own material string, then call this once.
 */
export function hashFingerprintMaterial(material: string): string {
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}
