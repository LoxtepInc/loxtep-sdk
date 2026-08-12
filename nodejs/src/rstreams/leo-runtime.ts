/**
 * Loxtep stream runtime factory for the Node SDK data plane (ESM interop with the underlying runtime).
 *
 * IMPORTANT: do not statically `import 'leo-sdk'`. leo-sdk's `leoConfigure.js` runs
 * `build(process.cwd())` at module load and calls `fs.existsSync({})` when there is no
 * Leo system directory (DEP0187). REST-only CLI commands must not pay that cost or warning.
 */

import { createRequire } from 'node:module';
import type { ConfigurationResources, RStreamsSdk } from 'leo-sdk';

const require = createRequire(import.meta.url);

export function createRStreamsSdk(config: ConfigurationResources): RStreamsSdk {
  // Lazy CJS require — only when a stream reader/writer is actually constructed.
  const StreamRuntime = require('leo-sdk') as Record<string, unknown> & {
    default?: Record<string, unknown>;
    RStreamsSdk?: new (config: ConfigurationResources) => RStreamsSdk;
  };
  const defaultExport = StreamRuntime.default;
  const SDK = (StreamRuntime.RStreamsSdk || defaultExport?.RStreamsSdk) as
    | (new (config: ConfigurationResources) => RStreamsSdk)
    | undefined;
  if (!SDK || typeof SDK !== 'function') {
    throw new Error('Failed to resolve RStreamsSdk constructor from leo-sdk');
  }
  return new SDK(config);
}

export type { ConfigurationResources, RStreamsSdk } from 'leo-sdk';
/** Loxtep stream runtime handle (injected in tests or advanced wiring). */
export type { RStreamsSdk as LoxtepStreamRuntime } from 'leo-sdk';
