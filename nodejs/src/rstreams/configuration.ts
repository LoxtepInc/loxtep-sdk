/**
 * Resolve Loxtep stream bus configuration from explicit options and process.env
 * (resource names from your instance / stack).
 */

import type { ConfigurationResources } from './leo-runtime.js';

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v != null && String(v).trim() !== '' ? String(v).trim() : undefined;
};

/**
 * Merge partial config with environment defaults (instance stream env + `AWS_REGION`).
 * Returns undefined if required fields are missing (caller treats as "no bus configured").
 */
export function resolveStreamsConfiguration(
  partial?: Partial<ConfigurationResources>
): ConfigurationResources | undefined {
  const Region = partial?.Region ?? env('AWS_REGION') ?? env('LEO_REGION');
  const LeoEvent = partial?.LeoEvent ?? env('LEO_EVENT_TABLE');
  const LeoStream = partial?.LeoStream ?? env('LEO_STREAM_TABLE');
  const LeoCron = partial?.LeoCron ?? env('LEO_CRON_TABLE');
  const LeoS3 = partial?.LeoS3 ?? env('LEO_S3_BUCKET');
  const LeoKinesisStream = partial?.LeoKinesisStream ?? env('LEO_KINESIS_STREAM');
  const LeoFirehoseStream =
    partial?.LeoFirehoseStream ?? env('FIREHOSE_STREAM') ?? env('LEO_FIREHOSE_STREAM');
  const LeoSettings = partial?.LeoSettings ?? env('LEO_SETTINGS_TABLE');
  if (
    !Region ||
    !LeoEvent ||
    !LeoStream ||
    !LeoCron ||
    !LeoS3 ||
    !LeoKinesisStream ||
    !LeoFirehoseStream ||
    !LeoSettings
  ) {
    return undefined;
  }
  return {
    Region,
    LeoEvent,
    LeoStream,
    LeoCron,
    LeoS3,
    LeoKinesisStream,
    LeoFirehoseStream,
    LeoSettings,
  };
}
