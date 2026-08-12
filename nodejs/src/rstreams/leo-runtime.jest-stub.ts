/**
 * Jest-only stand-in for leo-runtime.ts.
 *
 * The real module uses top-level `import.meta.url` (valid in the published ESM
 * package). ts-jest compiles SDK sources as CJS, which cannot parse/evaluate
 * that. Tests that need a stream runtime mock `leo-runtime` themselves
 * (see data-products-writer-reader.test.ts); everything else gets this stub
 * via jest.config.cjs moduleNameMapper.
 */

import type { ConfigurationResources, RStreamsSdk } from 'leo-sdk';

export function createRStreamsSdk(_config: ConfigurationResources): RStreamsSdk {
  throw new Error(
    'createRStreamsSdk is stubbed under Jest; mock src/rstreams/leo-runtime in tests that need a stream runtime'
  );
}

export type { ConfigurationResources, RStreamsSdk } from 'leo-sdk';
/** Loxtep stream runtime handle (injected in tests or advanced wiring). */
export type { RStreamsSdk as LoxtepStreamRuntime } from 'leo-sdk';
