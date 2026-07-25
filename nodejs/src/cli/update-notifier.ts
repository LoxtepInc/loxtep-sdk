/**
 * Non-blocking npm update notice for the `loxtep` CLI.
 *
 * Checks registry.npmjs.org for a newer `@loxtep/sdk` version at most once per
 * {@link DEFAULT_CHECK_INTERVAL_MS}. Failures are silent. Opt out with
 * `LOXTEP_NO_UPDATE_NOTIFIER=1` or `NO_UPDATE_NOTIFIER=1`, or when `CI` is set.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getConfigDir } from '../config/paths.js';
import { getSdkVersion } from './version.js';

export const NPM_PACKAGE_NAME = '@loxtep/sdk';
export const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_FETCH_TIMEOUT_MS = 1500;

const CACHE_FILENAME = 'update-check.json';

export interface UpdateCheckCache {
  checked_at: string;
  latest_version?: string;
  current_version?: string;
}

export interface UpdateNotifierDeps {
  currentVersion?: string;
  nowMs?: () => number;
  fetchFn?: typeof fetch;
  cachePath?: string;
  checkIntervalMs?: number;
  fetchTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** When false, skip writing the cache (tests). Default true. */
  persistCache?: boolean;
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** True when the notifier should not run (CI / explicit opt-out). */
export function shouldSkipUpdateCheck(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    isTruthyEnv(env.CI) ||
    isTruthyEnv(env.LOXTEP_NO_UPDATE_NOTIFIER) ||
    isTruthyEnv(env.NO_UPDATE_NOTIFIER)
  );
}

export function getUpdateCheckCachePath(configDir: string = getConfigDir()): string {
  return join(configDir, CACHE_FILENAME);
}

/**
 * Compare dotted semver-ish strings (ignores prerelease/build for notify purposes).
 * Returns true when `latest` is strictly greater than `current`.
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string): number[] => {
    const core = v.trim().replace(/^v/i, '').split('-')[0]?.split('+')[0] ?? '';
    const parts = core.split('.').map(p => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
  };
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}

/** Bold yellow — applied per-line so embedded ANSI codes never split a matched substring. */
function boldYellow(line: string): string {
  return `\x1b[1m\x1b[33m${line}\x1b[0m`;
}

export function formatUpdateAvailableMessage(
  currentVersion: string,
  latestVersion: string,
  packageName: string = NPM_PACKAGE_NAME,
  useColor: boolean = Boolean(process.stderr.isTTY)
): string {
  const lines = [
    `⚠ Update available: ${packageName}@${latestVersion} (current: ${currentVersion})`,
    `  Upgrade: npm install -g ${packageName}@latest`,
    `  Or:      pnpm add -g ${packageName}@latest`,
  ];
  return (useColor ? lines.map(boldYellow) : lines).join('\n');
}

async function readCache(path: string): Promise<UpdateCheckCache | null> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as UpdateCheckCache;
    if (!parsed || typeof parsed.checked_at !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(path: string, cache: UpdateCheckCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

async function fetchLatestVersion(
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}/latest`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    const version = typeof body.version === 'string' ? body.version.trim() : '';
    return version.length > 0 ? version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check npm for a newer package version and return a user-facing notice, or null.
 * Safe to call on every CLI invocation — network is skipped when the cache is fresh.
 */
export async function checkForCliUpdate(deps: UpdateNotifierDeps = {}): Promise<string | null> {
  const env = deps.env ?? process.env;
  if (shouldSkipUpdateCheck(env)) return null;

  const currentVersion = deps.currentVersion ?? getSdkVersion();
  const nowMs = deps.nowMs ?? Date.now;
  const checkIntervalMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  const fetchTimeoutMs = deps.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const cachePath = deps.cachePath ?? getUpdateCheckCachePath();
  const fetchFn = deps.fetchFn ?? fetch;
  const persistCache = deps.persistCache !== false;

  const cache = await readCache(cachePath);
  const checkedAtMs = cache?.checked_at ? Date.parse(cache.checked_at) : Number.NaN;
  const cacheFresh =
    Number.isFinite(checkedAtMs) && nowMs() - checkedAtMs < checkIntervalMs;

  let latestVersion = cacheFresh ? cache?.latest_version : undefined;

  if (!latestVersion) {
    latestVersion = (await fetchLatestVersion(fetchFn, fetchTimeoutMs)) ?? undefined;
    if (persistCache && latestVersion) {
      try {
        await writeCache(cachePath, {
          checked_at: new Date(nowMs()).toISOString(),
          latest_version: latestVersion,
          current_version: currentVersion,
        });
      } catch {
        // Cache write failures must not affect the CLI.
      }
    }
  }

  if (!latestVersion || !isNewerVersion(latestVersion, currentVersion)) {
    return null;
  }

  return formatUpdateAvailableMessage(currentVersion, latestVersion);
}

/**
 * Print an update notice to stderr when available. Never throws.
 */
export async function notifyCliUpdateAvailable(
  deps: UpdateNotifierDeps = {}
): Promise<void> {
  try {
    const message = await checkForCliUpdate(deps);
    if (message) {
      console.error(`\n${message}\n`);
    }
  } catch {
    // Never fail the CLI because of an update check.
  }
}

/**
 * Module-level handle to the in-flight update check started by `startUpdateCheck()`, so any
 * early-exit path elsewhere in the CLI (e.g. `requireCliClient`'s `process.exit(1)` when
 * credentials are missing) can wait for it before terminating the process. A bare
 * `process.exit()` skips pending promises and `finally` blocks up the call stack, so without
 * this the notice would silently never print for any command that hits an early guard.
 */
let pendingUpdateCheck: Promise<void> | null = null;

/** Kick off the update check and remember it so `waitForUpdateCheck()` can await it later. */
export function startUpdateCheck(deps: UpdateNotifierDeps = {}): Promise<void> {
  pendingUpdateCheck = notifyCliUpdateAvailable(deps);
  return pendingUpdateCheck;
}

/** Await the in-flight update check (if one was started), so its notice has a chance to print. */
export async function waitForUpdateCheck(): Promise<void> {
  if (pendingUpdateCheck) {
    await pendingUpdateCheck;
  }
}
