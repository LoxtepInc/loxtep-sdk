import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { saveConfig } from './save.js';

describe('saveConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `loxtep-save-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should write only api_url, organization_id, project_id (no token)', async () => {
    const configPath = join(tmpDir, 'config.json');
    await saveConfig(
      {
        api_url: 'https://api.example.com',
        organization_id: 'org-1',
        project_id: 'proj-1',
      },
      configPath
    );
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.api_url).toBe('https://api.example.com');
    expect(parsed.organization_id).toBe('org-1');
    expect(parsed.project_id).toBe('proj-1');
    expect(parsed.token).toBeUndefined();
    expect(new Set(Object.keys(parsed))).toEqual(
      new Set(['api_url', 'organization_id', 'project_id'])
    );
  });

  it('should persist region and streams when set', async () => {
    const configPath = join(tmpDir, 'config.json');
    await saveConfig(
      {
        api_url: 'https://api.example.com',
        region: 'ap-south-1',
        streams: { Region: 'ap-south-1', LeoEvent: 'evt' },
      },
      configPath
    );
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.api_url).toBe('https://api.example.com');
    expect(parsed.region).toBe('ap-south-1');
    expect((parsed.streams as { LeoEvent: string }).LeoEvent).toBe('evt');
  });

  it('should create config directory if missing', async () => {
    const configPath = join(tmpDir, 'nested', 'dir', 'config.json');
    await saveConfig({ api_url: 'https://x.com' }, configPath);
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.api_url).toBe('https://x.com');
  });
});
