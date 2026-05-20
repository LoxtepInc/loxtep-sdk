/**
 * Parse `streams` object from JSON config (PascalCase keys matching leo-sdk `ConfigurationResources`).
 */

import type { ConfigurationResources } from '../rstreams/leo-runtime.js';

const STREAM_KEYS: (keyof ConfigurationResources)[] = [
  'Region',
  'LeoEvent',
  'LeoStream',
  'LeoCron',
  'LeoS3',
  'LeoKinesisStream',
  'LeoFirehoseStream',
  'LeoSettings',
];

/**
 * Extract a partial bus config from unknown JSON. Ignores unknown keys; only non-empty strings kept.
 */
export function parseStreamsPartial(value: unknown): Partial<ConfigurationResources> | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  const out: Partial<ConfigurationResources> = {};
  for (const k of STREAM_KEYS) {
    const v = o[k as string];
    if (typeof v === 'string' && v.trim() !== '') {
      (out as Record<string, string>)[k as string] = v.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
