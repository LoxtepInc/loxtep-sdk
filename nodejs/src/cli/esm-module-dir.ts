/**
 * ESM-only module directory helper.
 *
 * Uses `import.meta.url` so callers can locate sibling files when the CLI is
 * started through an npm/npx `.bin` shim (where `process.argv[1]` is not the
 * real `dist/cli/*.js` path). Kept in its own file so Jest can map it to a
 * CJS-safe stub (ts-jest cannot parse `import.meta`).
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function esmModuleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}
