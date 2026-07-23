/**
 * CLI/SDK version from package.json (same semver as `@loxtep/sdk` on npm).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion: string | undefined;

/** Resolve `@loxtep/sdk` semver from the installed package.json. */
export function getSdkVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
  cachedVersion = pkg.version ?? '0.0.0';
  return cachedVersion;
}

export function formatCliVersionLine(): string {
  return `@loxtep/sdk ${getSdkVersion()}`;
}

export function printCliVersion(): void {
  console.log(formatCliVersionLine());
}
