import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCliConfig } from './load-cli-config.js';

describe('loadCliConfig', () => {
  const origEnv = { ...process.env };
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'loxtep-cli-cfg-'));
    delete process.env.LOXTEP_ORGANIZATION_ID;
    delete process.env.LOXTEP_PROJECT_ID;
    delete process.env.LOXTEP_INSTANCE_ID;
  });

  afterEach(async () => {
    process.env = { ...origEnv };
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('merges project_id and organization_id from .loxtep/project.json', async () => {
    const loxtepDir = join(tmpRoot, '.loxtep');
    await mkdir(loxtepDir, { recursive: true });
    await writeFile(
      join(loxtepDir, 'project.json'),
      JSON.stringify({
        project_id: 'ed125001-d343-483a-b045-ef2bcaeffb2c',
        organization_id: '00000000-0000-4000-8000-000000000001',
        instance_id: 'a9da8b2d-5ef0-44ba-80c9-9039f5b9a8f0',
        api_url: 'https://instance-gateway.example.com/prod/',
      })
    );

    // Point configFilePath at a missing file under tmpRoot so ~/.loxtep/config.json
    // from the developer machine cannot shadow workspace project.json fields.
    const { config, workspace_api_url } = await loadCliConfig({
      cwd: tmpRoot,
      configFilePath: join(tmpRoot, 'no-global-config.json'),
    });
    expect(config.project_id).toBe('ed125001-d343-483a-b045-ef2bcaeffb2c');
    expect(config.organization_id).toBe('00000000-0000-4000-8000-000000000001');
    expect(config.instance_id).toBe('a9da8b2d-5ef0-44ba-80c9-9039f5b9a8f0');
    expect(workspace_api_url).toBe('https://instance-gateway.example.com/prod/');
  });

  it('merges region and streams from .loxtep/project.json', async () => {
    const loxtepDir = join(tmpRoot, '.loxtep');
    await mkdir(loxtepDir, { recursive: true });
    await writeFile(
      join(loxtepDir, 'project.json'),
      JSON.stringify({
        project_id: 'ed125001-d343-483a-b045-ef2bcaeffb2c',
        region: 'us-east-1',
        streams: {
          Region: 'us-east-1',
          LeoEvent: 'prod-LeoEvent',
          LeoStream: 'prod-LeoStream',
        },
      })
    );

    const { config } = await loadCliConfig({
      cwd: tmpRoot,
      configFilePath: join(tmpRoot, 'no-global-config.json'),
    });
    expect(config.region).toBe('us-east-1');
    expect(config.streams?.LeoEvent).toBe('prod-LeoEvent');
    expect(config.streams?.LeoStream).toBe('prod-LeoStream');
  });
});
