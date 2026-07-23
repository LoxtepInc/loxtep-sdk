/**
 * Map instance stream-config API responses to SDK `streams` config (PascalCase).
 */

import type { ConfigurationResources } from '../rstreams/leo-runtime.js';
import type { InstanceStreamConfig } from '../client/instances.js';

/** Full stream bus resource names required for `resolveStreamsConfiguration`. */
export type FullInstanceStreamConfig = InstanceStreamConfig;

/**
 * Convert GET /instances/{id}/stream-config into the `streams` object stored on
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
