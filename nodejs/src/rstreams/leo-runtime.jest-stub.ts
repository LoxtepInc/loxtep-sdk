/**
 * Jest-only stand-in for leo-runtime.ts.
 *
 * The real module uses top-level `import.meta.url` (valid in the published ESM
 * package). ts-jest compiles SDK sources as CJS, which cannot parse/evaluate
 * that. Tests that need a real stream runtime mock `leo-runtime` themselves
 * (see data-products-writer-reader.test.ts). Everything else gets this stub
 * via jest.config.cjs moduleNameMapper.
 *
 * Returns a Proxy so constructing `LoxtepClient` with a full `streams` config
 * (CLI harnesses) does not throw; calling any SDK method without an explicit
 * mock still fails loudly.
 */

import type { ConfigurationResources, RStreamsSdk } from 'leo-sdk';

export function createRStreamsSdk(_config: ConfigurationResources): RStreamsSdk {
  return new Proxy({} as RStreamsSdk, {
    get(_target, prop) {
      if (prop === 'then') return undefined; // not thenable
      throw new Error(
        `createRStreamsSdk is stubbed under Jest; mock src/rstreams/leo-runtime before using .${String(prop)}`
      );
    },
  });
}

export type { ConfigurationResources, RStreamsSdk } from 'leo-sdk';
/** Loxtep stream runtime handle (injected in tests or advanced wiring). */
export type { RStreamsSdk as LoxtepStreamRuntime } from 'leo-sdk';
