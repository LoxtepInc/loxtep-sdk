/**
 * Resolve and map instance stream-config for SDK `streams` / attach.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { Instance, InstanceStreamConfig } from '../client/instances-types.js';
import type { ConfigurationResources } from '../rstreams/leo-runtime.js';

const INSTANCES_BASE = '/organizations/instances';
const OBSERVE_STREAM_CONFIG = '/observe/stream-config';
const INSTANCE_ID_HEADER = 'x-loxtep-instance-id';

export type InstanceStreamConfigSource = 'organizations' | 'observe' | 'instance-metadata';

const STREAM_CONFIG_KEYS: (keyof InstanceStreamConfig)[] = [
  'Region',
  'LeoEvent',
  'LeoStream',
  'LeoCron',
  'LeoS3',
  'LeoKinesisStream',
  'LeoFirehoseStream',
  'LeoSettings',
];

/** Full stream bus resource names required for `resolveStreamsConfiguration`. */
export type FullInstanceStreamConfig = InstanceStreamConfig;

function hasRequiredStreamKeys(source: Record<string, unknown>): boolean {
  return STREAM_CONFIG_KEYS.every(
    key => typeof source[key] === 'string' && (source[key] as string).length > 0
  );
}

function pickStreamConfig(source: Record<string, string>): InstanceStreamConfig {
  return {
    Region: source.Region,
    LeoEvent: source.LeoEvent,
    LeoStream: source.LeoStream,
    LeoCron: source.LeoCron,
    LeoS3: source.LeoS3,
    LeoKinesisStream: source.LeoKinesisStream,
    LeoFirehoseStream: source.LeoFirehoseStream,
    LeoSettings: source.LeoSettings,
  };
}

function parseStreamConfigRecord(
  source: Record<string, unknown> | undefined,
  defaultRegion?: string
): InstanceStreamConfig | null {
  if (!source) return null;
  const withRegion: Record<string, unknown> = {
    ...source,
    Region: source.Region || defaultRegion || 'us-east-1',
  };
  if (!hasRequiredStreamKeys(withRegion)) return null;
  return pickStreamConfig(withRegion as Record<string, string>);
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Extract stream config embedded on an instance record (shared / legacy paths).
 * Used when dedicated stream-config REST is unavailable (404 before org MS deploy).
 */
export function extractStreamConfigFromInstance(instance: Instance): InstanceStreamConfig | null {
  const region = instance.region || 'us-east-1';
  const metadata = parseJsonObject(instance.metadata);
  if (metadata?.rstreams && typeof metadata.rstreams === 'object') {
    const parsed = parseStreamConfigRecord(metadata.rstreams as Record<string, unknown>, region);
    if (parsed) return parsed;
  }

  const connectionDetails = parseJsonObject(instance.connection_details);
  if (connectionDetails) {
    const observeApi = connectionDetails.observe_api as Record<string, unknown> | undefined;
    const rstreams =
      (observeApi?.rstreams as Record<string, unknown> | undefined) ??
      (connectionDetails.rstreams as Record<string, unknown> | undefined);
    const parsed = parseStreamConfigRecord(rstreams, region);
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Resolve stream bus config for an instance. Tries, in order:
 * 1. GET /organizations/instances/{id}/stream-config
 * 2. GET /observe/stream-config (proxied botmon; sends x-loxtep-instance-id)
 * 3. Inline metadata / connection_details on the instance record (when provided)
 */
export async function fetchInstanceStreamConfig(
  http: LoxtepHttpClient,
  instanceId: string,
  options?: { instance?: Instance }
): Promise<{ config: InstanceStreamConfig; source: InstanceStreamConfigSource }> {
  const errors: string[] = [];

  try {
    const res = await http.get<{ success: true; data: InstanceStreamConfig }>(
      `${INSTANCES_BASE}/${encodeURIComponent(instanceId)}/stream-config`
    );
    const parsed = parseStreamConfigRecord(
      res.data as unknown as Record<string, unknown>,
      options?.instance?.region
    );
    if (parsed) {
      return { config: parsed, source: 'organizations' };
    }
    errors.push('organizations stream-config returned incomplete data');
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    const res = await http.get<{ success: true; data: Record<string, string> }>(
      OBSERVE_STREAM_CONFIG,
      { headers: { [INSTANCE_ID_HEADER]: instanceId } }
    );
    const parsed = parseStreamConfigRecord(res.data, options?.instance?.region);
    if (parsed) {
      return { config: parsed, source: 'observe' };
    }
    errors.push('observe stream-config returned incomplete data');
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  if (options?.instance) {
    const fromInstance = extractStreamConfigFromInstance(options.instance);
    if (fromInstance) {
      return { config: fromInstance, source: 'instance-metadata' };
    }
    errors.push('instance record has no embedded rstreams metadata');
  }

  throw new Error(
    `Unable to resolve stream bus configuration for instance '${instanceId}' (${errors.join('; ')})`
  );
}

/**
 * Convert stream-config API data into the `streams` object stored on
 * `.loxtep/project.json` and passed to `LoxtepClient` / `resolveStreamsConfiguration`.
 */
export function instanceStreamConfigToStreams(
  config: FullInstanceStreamConfig
): ConfigurationResources {
  return {
    Region: config.Region,
    LeoEvent: config.LeoEvent,
    LeoStream: config.LeoStream,
    LeoCron: config.LeoCron,
    LeoS3: config.LeoS3,
    LeoKinesisStream: config.LeoKinesisStream,
    LeoFirehoseStream: config.LeoFirehoseStream,
    LeoSettings: config.LeoSettings,
  };
}

/** Returns true when all required Leo resource names are non-empty strings. */
export function isCompleteStreamConfig(
  config: Partial<ConfigurationResources> | undefined
): config is ConfigurationResources {
  if (!config) return false;
  return Boolean(
    config.Region &&
      config.LeoEvent &&
      config.LeoStream &&
      config.LeoCron &&
      config.LeoS3 &&
      config.LeoKinesisStream &&
      config.LeoFirehoseStream &&
      config.LeoSettings
  );
}
