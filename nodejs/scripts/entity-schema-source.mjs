/** Shared constants and helpers for sync-entity-schemas / check-entity-schemas. */
import { createHash } from 'node:crypto';

export const SCHEMA_SOURCE_REPOSITORY = 'LoxtepInc/loxtep';
export const SCHEMA_SOURCE_PATH = 'platform-backend/_core/src/workspace/entity-json-schemas';

/** Git blob id (sha1 of "blob <len>\0<content>") so a pin can be checked offline. */
export function gitBlobSha(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}
