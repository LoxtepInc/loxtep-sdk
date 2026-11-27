/**
 * Jest/ts-jest stub for `esm-module-dir.ts` (avoids parsing `import.meta`).
 * Under CJS transform, `__dirname` is this file's directory (`src/cli`).
 */

export function esmModuleDir(): string {
  return __dirname;
}
