/**
 * CLI/SDK version from package.json (same semver as `@loxtep/sdk` on npm).
 */

import pkg from '../../package.json' with { type: 'json' };

let cachedVersion: string | undefined;

/** Resolve `@loxtep/sdk` semver from the installed package.json. */
export function getSdkVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  cachedVersion = pkg.version ?? '0.0.0';
  return cachedVersion;
}

export function formatCliVersionLine(): string {
  return `@loxtep/sdk ${getSdkVersion()}`;
}

export function printCliVersion(): void {
  console.log(formatCliVersionLine());
}
