/**
 * CLI integration tests — local project lifecycle (init, attach, generate, deploy, test).
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { runInitCommand } from './commands/init-cmd.js';
import { runAttach } from './commands/attach-cmd.js';
import { runGenerateCommand } from './commands/generate-cmd.js';
import { runDeployCommand } from './commands/deploy-cmd.js';
import { runTestCommand } from './commands/test-cmd.js';
import { runLogout } from './commands/logout.js';
import { runConfigExportFromDataProduct } from './commands/config-cmd.js';
import { createCliClient } from './create-cli-client.js';
import { buildSdkIngestLocalPackage } from '../lib/sdk-ingest-bundle.js';
import {
  createLocalProjectHarness,
  writeMinimalWorkflowModule,
  captureCliOutput,
  expectCliSuccess,
} from './__tests__/cli-test-harness.js';
import { MOCK_IDS } from './__tests__/mock-platform-api.js';

describe('CLI local integration (mock platform API)', () => {
  let harness: Awaited<ReturnType<typeof createLocalProjectHarness>>;

  beforeEach(async () => {
    delete process.env.LOXTEP_AUTH_TOKEN;
    process.exitCode = 0;
    harness = await createLocalProjectHarness();
  });

  afterEach(async () => {
    await harness.destroy();
  });

  it('init scaffolds project and creates platform project when client provided', async () => {
    const initDir = join(harness.configDir, 'new-project');
    const clientResult = await createCliClient(harness.cliOptions);
    expect(clientResult).not.toBeNull();

    const result = await runInitCommand({
      cwd: initDir,
      client: clientResult!.client,
      name: 'Integration Project',
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(initDir, '.loxtep', 'project.json'))).toBe(true);
    expect(existsSync(join(initDir, 'workflows'))).toBe(true);
    const projectJson = JSON.parse(
      readFileSync(join(initDir, '.loxtep', 'project.json'), 'utf-8')
    ) as { project_id?: string };
    expect(projectJson.project_id).toBe('project-created-001');
  });

  it('attach writes instance_id and api_url to project.json', async () => {
    const unattachedDir = join(harness.configDir, 'unattached');
    const loxtepDir = join(unattachedDir, '.loxtep');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(loxtepDir, { recursive: true });
    await writeFile(
      join(loxtepDir, 'project.json'),
      JSON.stringify({ project_id: MOCK_IDS.project_id }, null, 2),
      'utf-8'
    );

    const clientResult = await createCliClient(harness.cliOptions);
    const result = await runAttach(clientResult!.client, {
      cwd: unattachedDir,
      instanceId: MOCK_IDS.instance_id,
    });

    expect(result.exitCode).toBe(0);
    const config = JSON.parse(readFileSync(join(loxtepDir, 'project.json'), 'utf-8')) as {
      instance_id?: string;
      api_url?: string;
      repository?: { url: string };
    };
    expect(config.instance_id).toBe(MOCK_IDS.instance_id);
    expect(config.api_url).toBeTruthy();
    expect(config.repository?.url).toContain('github.com');
  });

  it('generate emits typed artifact from mock workspace context', async () => {
    const result = await runGenerateCommand({
      cwd: harness.projectDir,
      cliOptions: harness.cliOptions,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join('\n')).toContain('Generated');
    expect(existsSync(join(harness.projectDir, '.loxtep', 'generated', 'index.ts'))).toBe(true);
  });

  it('deploy compiles minimal workflow module against mock API', async () => {
    await writeMinimalWorkflowModule(harness.projectDir, 'echo-test');

    const result = await runDeployCommand({
      cwd: harness.projectDir,
      cliOptions: harness.cliOptions,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join('\n')).toContain('Deploy target');
    expect(result.stdout.join('\n')).toMatch(/Created|Updated/);
  });

  it('deploy pushes and activates a local JSON-entity workflow package (SDK-first ingest flow)', async () => {
    const pkg = buildSdkIngestLocalPackage({
      organization_id: MOCK_IDS.organization_id,
      project_id: MOCK_IDS.project_id,
      domain_id: MOCK_IDS.domain_id,
      connector_id: MOCK_IDS.connector_sdk_id,
      data_product_name: 'app-events',
      include_connector_file: false,
    });
    for (const [relPath, entity] of Object.entries(pkg.files)) {
      const full = join(harness.projectDir, relPath);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, JSON.stringify(entity, null, 2));
    }

    const result = await runDeployCommand({
      cwd: harness.projectDir,
      cliOptions: harness.cliOptions,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join('\n')).not.toContain('Nothing to deploy');
    expect(result.stdout.join('\n')).toContain(pkg.workflow_id);
    expect(result.stdout.join('\n')).toContain('Deployment tracking');
  });

  it('deploy reports nothing to do when workflows/ has neither modules nor JSON packages', async () => {
    const result = await runDeployCommand({
      cwd: harness.projectDir,
      cliOptions: harness.cliOptions,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join('\n')).toContain('No workflow modules found in workflows/. Nothing to deploy.');
  });

  it('test runs handler locally and prints trace', async () => {
    await writeMinimalWorkflowModule(harness.projectDir, 'echo-test');
    const eventPath = join(harness.projectDir, 'sample-event.json');
    await writeFile(eventPath, JSON.stringify({ hello: 'world' }), 'utf-8');

    const result = await runTestCommand({
      cwd: harness.projectDir,
      moduleName: 'echo-test',
      eventFile: eventPath,
      cliOptions: harness.cliOptions,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.join('\n')).toContain('Test completed');
    expect(result.stdout.join('\n')).toContain('handler.complete');
  });

  it('config export from data product resolves stream bindings', async () => {
    const out = captureCliOutput();
    await runConfigExportFromDataProduct(MOCK_IDS.data_product_id, {
      ...harness.cliOptions,
      format: 'json',
    });
    expectCliSuccess(out, 'LeoEvent', MOCK_IDS.bot_id);
    out.restore();
  });

  it('logout removes project-local credentials', async () => {
    expect(existsSync(harness.projectCredentialsPath)).toBe(true);
    const out = captureCliOutput();
    await runLogout({ scope: 'local', cwd: harness.projectDir });
    expectCliSuccess(out, 'Logged out');
    expect(existsSync(harness.projectCredentialsPath)).toBe(false);
    out.restore();
  });
});
