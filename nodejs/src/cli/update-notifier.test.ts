/**
 * Unit tests for CLI update notifier (semver compare, cache, opt-out).
 */

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkForCliUpdate,
  formatUpdateAvailableMessage,
  isNewerVersion,
  shouldSkipUpdateCheck,
} from './update-notifier.js';

describe('update-notifier', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'loxtep-update-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  describe('isNewerVersion', () => {
    it('detects newer major/minor/patch', () => {
      expect(isNewerVersion('0.8.0', '0.7.26')).toBe(true);
      expect(isNewerVersion('0.7.27', '0.7.26')).toBe(true);
      expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
    });

    it('returns false when equal or older', () => {
      expect(isNewerVersion('0.7.26', '0.7.26')).toBe(false);
      expect(isNewerVersion('0.7.25', '0.7.26')).toBe(false);
      expect(isNewerVersion('0.6.99', '0.7.0')).toBe(false);
    });

    it('ignores prerelease/build for notify compare', () => {
      expect(isNewerVersion('0.7.27-beta.1', '0.7.26')).toBe(true);
      expect(isNewerVersion('0.7.26+build', '0.7.26')).toBe(false);
    });
  });

  describe('shouldSkipUpdateCheck', () => {
    it('skips in CI and when opt-out env is set', () => {
      expect(shouldSkipUpdateCheck({ CI: 'true' })).toBe(true);
      expect(shouldSkipUpdateCheck({ LOXTEP_NO_UPDATE_NOTIFIER: '1' })).toBe(true);
      expect(shouldSkipUpdateCheck({ NO_UPDATE_NOTIFIER: 'yes' })).toBe(true);
      expect(shouldSkipUpdateCheck({})).toBe(false);
    });
  });

  describe('checkForCliUpdate', () => {
    it('returns a notice when registry reports a newer version', async () => {
      const cachePath = join(cacheDir, 'update-check.json');
      const fetchFn = jest.fn(async () =>
        ({
          ok: true,
          json: async () => ({ version: '9.9.9' }),
        }) as Response
      );

      const message = await checkForCliUpdate({
        currentVersion: '0.7.26',
        cachePath,
        fetchFn,
        env: {},
        nowMs: () => Date.parse('2026-07-24T12:00:00.000Z'),
      });

      expect(message).toContain('Update available');
      expect(message).toContain('9.9.9');
      expect(message).toContain('0.7.26');
      expect(fetchFn).toHaveBeenCalledTimes(1);

      const cache = JSON.parse(await readFile(cachePath, 'utf8')) as {
        latest_version: string;
      };
      expect(cache.latest_version).toBe('9.9.9');
    });

    it('uses fresh cache and skips network', async () => {
      const cachePath = join(cacheDir, 'update-check.json');
      await mkdir(cacheDir, { recursive: true });
      await writeFile(
        cachePath,
        JSON.stringify({
          checked_at: '2026-07-24T11:00:00.000Z',
          latest_version: '9.9.9',
          current_version: '0.7.26',
        }),
        'utf8'
      );
      const fetchFn = jest.fn();

      const message = await checkForCliUpdate({
        currentVersion: '0.7.26',
        cachePath,
        fetchFn,
        env: {},
        nowMs: () => Date.parse('2026-07-24T12:00:00.000Z'),
        checkIntervalMs: 24 * 60 * 60 * 1000,
      });

      expect(fetchFn).not.toHaveBeenCalled();
      expect(message).toContain('9.9.9');
    });

    it('returns null when already on latest', async () => {
      const cachePath = join(cacheDir, 'update-check.json');
      const fetchFn = jest.fn(async () =>
        ({
          ok: true,
          json: async () => ({ version: '0.7.26' }),
        }) as Response
      );

      const message = await checkForCliUpdate({
        currentVersion: '0.7.26',
        cachePath,
        fetchFn,
        env: {},
      });

      expect(message).toBeNull();
    });

    it('returns null on network failure', async () => {
      const cachePath = join(cacheDir, 'update-check.json');
      const fetchFn = jest.fn(async () => {
        throw new Error('offline');
      });

      const message = await checkForCliUpdate({
        currentVersion: '0.7.26',
        cachePath,
        fetchFn,
        env: {},
      });

      expect(message).toBeNull();
    });

    it('respects LOXTEP_NO_UPDATE_NOTIFIER', async () => {
      const fetchFn = jest.fn();
      const message = await checkForCliUpdate({
        currentVersion: '0.7.26',
        cachePath: join(cacheDir, 'update-check.json'),
        fetchFn,
        env: { LOXTEP_NO_UPDATE_NOTIFIER: '1' },
      });
      expect(message).toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('formatUpdateAvailableMessage', () => {
    it('includes upgrade commands', () => {
      const msg = formatUpdateAvailableMessage('0.7.26', '0.8.0');
      expect(msg).toContain('npm install -g @loxtep/sdk@latest');
      expect(msg).toContain('pnpm add -g @loxtep/sdk@latest');
    });
  });
});
