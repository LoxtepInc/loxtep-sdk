import { mkdir, writeFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, loadConfigSync } from './load.js';
import { DEFAULT_CONFIG } from './types.js';

describe('loadConfig', () => {
  const origEnv = { ...process.env };
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `loxtep-config-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    process.env.LOXTEP_API_URL = '';
    process.env.LOXTEP_ORGANIZATION_ID = '';
    process.env.LOXTEP_PROJECT_ID = '';
    process.env.LOXTEP_REGION = '';
    delete process.env.LOXTEP_RSTREAMS_CONFIG_FILE;
  });

  afterEach(async () => {
    process.env = { ...origEnv };
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should return defaults when no env or file', async () => {
    const configPath = join(tmpDir, 'nonexistent.json');
    const config = await loadConfig(configPath);
    expect(config.api_url).toBe(DEFAULT_CONFIG.api_url);
    expect(config.organization_id).toBeUndefined();
    expect(config.project_id).toBeUndefined();
  });

  it('should load from env when set', async () => {
    process.env.LOXTEP_API_URL = 'https://api.example.com';
    process.env.LOXTEP_ORGANIZATION_ID = 'org-1';
    process.env.LOXTEP_PROJECT_ID = 'proj-1';
    const configPath = join(tmpDir, 'nonexistent.json');
    const config = await loadConfig(configPath);
    expect(config.api_url).toBe('https://api.example.com');
    expect(config.organization_id).toBe('org-1');
    expect(config.project_id).toBe('proj-1');
  });

  it('should load from file when no env', async () => {
    const configPath = join(tmpDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        api_url: 'https://file.example.com',
        organization_id: 'org-file',
        project_id: 'proj-file',
      }),
      'utf-8'
    );
    const config = await loadConfig(configPath);
    expect(config.api_url).toBe('https://file.example.com');
    expect(config.organization_id).toBe('org-file');
    expect(config.project_id).toBe('proj-file');
  });

  it('should load region and streams from file', async () => {
    const configPath = join(tmpDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        api_url: 'https://file.example.com',
        region: 'us-west-2',
        streams: {
          Region: 'us-west-2',
          LeoEvent: 'my-event-table',
        },
      }),
      'utf-8'
    );
    const config = await loadConfig(configPath);
    expect(config.api_url).toBe('https://file.example.com');
    expect(config.region).toBe('us-west-2');
    expect(config.streams?.Region).toBe('us-west-2');
    expect(config.streams?.LeoEvent).toBe('my-event-table');
  });

  it('should prefer env LOXTEP_REGION over file for region', async () => {
    const configPath = join(tmpDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        api_url: 'https://file.example.com',
        region: 'us-west-2',
      }),
      'utf-8'
    );
    process.env.LOXTEP_REGION = 'eu-central-1';
    const config = await loadConfig(configPath);
    expect(config.region).toBe('eu-central-1');
  });

  it('should prefer env over file (precedence)', async () => {
    const configPath = join(tmpDir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        api_url: 'https://file.example.com',
        organization_id: 'org-file',
        project_id: 'proj-file',
      }),
      'utf-8'
    );
    process.env.LOXTEP_API_URL = 'https://env.example.com';
    process.env.LOXTEP_ORGANIZATION_ID = 'org-env';
    // LOXTEP_PROJECT_ID not set → file value used
    const config = await loadConfig(configPath);
    expect(config.api_url).toBe('https://env.example.com');
    expect(config.organization_id).toBe('org-env');
    expect(config.project_id).toBe('proj-file');
  });

  it('should merge streams from LOXTEP_RSTREAMS_CONFIG_FILE on top of main file', async () => {
    const mainPath = join(tmpDir, 'config.json');
    const rstreamsPath = join(tmpDir, 'rstreams.json');
    await writeFile(
      mainPath,
      JSON.stringify({
        api_url: 'https://file.example.com',
        streams: {
          Region: 'us-west-2',
          LeoEvent: 'from-main',
        },
      }),
      'utf-8'
    );
    await writeFile(
      rstreamsPath,
      JSON.stringify({
        Region: 'eu-central-1',
        LeoStream: 'from-rstreams-file',
        LeoKinesisStream: 'kinesis-extra',
      }),
      'utf-8'
    );
    process.env.LOXTEP_RSTREAMS_CONFIG_FILE = rstreamsPath;
    const config = await loadConfig(mainPath);
    expect(config.streams?.Region).toBe('eu-central-1');
    expect(config.streams?.LeoEvent).toBe('from-main');
    expect(config.streams?.LeoStream).toBe('from-rstreams-file');
    expect(config.streams?.LeoKinesisStream).toBe('kinesis-extra');
  });
});

describe('loadConfigSync', () => {
  const origEnv = { ...process.env };
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `loxtep-config-sync-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    process.env.LOXTEP_API_URL = '';
    process.env.LOXTEP_ORGANIZATION_ID = '';
    process.env.LOXTEP_PROJECT_ID = '';
    delete process.env.LOXTEP_RSTREAMS_CONFIG_FILE;
  });

  afterEach(async () => {
    process.env = { ...origEnv };
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should load from file when no env', () => {
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        api_url: 'https://sync-file.example.com',
        organization_id: 'org-sync',
      }),
      'utf-8'
    );
    const config = loadConfigSync(configPath);
    expect(config.api_url).toBe('https://sync-file.example.com');
    expect(config.organization_id).toBe('org-sync');
  });

  it('should merge LOXTEP_RSTREAMS_CONFIG_FILE in loadConfigSync', () => {
    const mainPath = join(tmpDir, 'config.json');
    const rstreamsPath = join(tmpDir, 'rstreams-sync.json');
    writeFileSync(
      mainPath,
      JSON.stringify({
        streams: { LeoCron: 'cron-main' },
      }),
      'utf-8'
    );
    writeFileSync(rstreamsPath, JSON.stringify({ LeoCron: 'cron-override' }), 'utf-8');
    process.env.LOXTEP_RSTREAMS_CONFIG_FILE = rstreamsPath;
    const config = loadConfigSync(mainPath);
    expect(config.streams?.LeoCron).toBe('cron-override');
  });
});
