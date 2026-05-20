/**
 * Loxtep stream runtime factory for the Node SDK data plane (ESM interop with the underlying runtime).
 */

import * as StreamRuntime from 'leo-sdk';

export function createRStreamsSdk(
  config: StreamRuntime.ConfigurationResources
): StreamRuntime.RStreamsSdk {
  const mod = StreamRuntime as unknown as Record<string, unknown>;
  const defaultExport = mod.default as Record<string, unknown> | undefined;
  const SDK = (mod.RStreamsSdk || defaultExport?.RStreamsSdk) as
    | (new (config: StreamRuntime.ConfigurationResources) => StreamRuntime.RStreamsSdk)
    | undefined;
  if (!SDK || typeof SDK !== 'function') {
    throw new Error('Failed to resolve RStreamsSdk constructor from leo-sdk');
  }
  return new SDK(config);
}

export type { ConfigurationResources, RStreamsSdk } from 'leo-sdk';
/** Loxtep stream runtime handle (injected in tests or advanced wiring). */
export type { RStreamsSdk as LoxtepStreamRuntime } from 'leo-sdk';
