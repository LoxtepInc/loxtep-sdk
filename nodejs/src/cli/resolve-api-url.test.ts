import { resolveCliApiUrl, configFileHasExplicitApiUrl } from './resolve-api-url.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('resolveCliApiUrl', () => {
  it('prefers LOXTEP_API_URL env', () => {
    const prev = process.env.LOXTEP_API_URL;
    process.env.LOXTEP_API_URL = 'https://env.example.com';
    try {
      expect(
        resolveCliApiUrl(DEFAULT_CONFIG, {
          access_token: 't',
          source: 'credentials',
          api_url_from_mcp: 'https://creds.example.com',
        })
      ).toBe('https://env.example.com');
    } finally {
      if (prev === undefined) delete process.env.LOXTEP_API_URL;
      else process.env.LOXTEP_API_URL = prev;
    }
  });

  it('uses credentials api_base_url over default config api_url', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loxtep-no-config-'));
    const missingConfigPath = join(dir, 'missing-config.json');
    try {
      expect(
        resolveCliApiUrl(
          { ...DEFAULT_CONFIG, api_url: 'https://api.loxtep.io' },
          {
            access_token: 't',
            source: 'credentials',
            api_url_from_mcp: 'https://apidev.loxtep.io',
          },
          { configFilePath: missingConfigPath }
        )
      ).toBe('https://apidev.loxtep.io');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses credentials api_base_url over explicit config file api_url', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loxtep-config-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ api_url: 'https://api.loxtep.io' }));
    try {
      expect(
        resolveCliApiUrl(
          { ...DEFAULT_CONFIG, api_url: 'https://api.loxtep.io' },
          {
            access_token: 't',
            source: 'credentials',
            api_url_from_mcp: 'https://apidev.loxtep.io',
          },
          { configFilePath: configPath }
        )
      ).toBe('https://apidev.loxtep.io');
      expect(configFileHasExplicitApiUrl(configPath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses explicit config file api_url when credentials have no api_base_url', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loxtep-config-nocreds-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ api_url: 'https://file.example.com' }));
    try {
      expect(
        resolveCliApiUrl(
          { ...DEFAULT_CONFIG, api_url: 'https://file.example.com' },
          {
            access_token: 't',
            source: 'credentials',
          },
          { configFilePath: configPath }
        )
      ).toBe('https://file.example.com');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
