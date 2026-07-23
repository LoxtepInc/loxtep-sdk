/**
 * Shared setup for CLI integration tests (temp config, credentials, mock fetch).
 */

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CreateCliClientOptions } from '../create-cli-client.js';
import {
  MOCK_PLATFORM_API,
  MOCK_IDS,
  createPlatformMockFetch,
} from './mock-platform-api.js';

export interface CliTestHarness {
  configDir: string;
  configPath: string;
  credentialsPath: string;
  fetchFn: typeof fetch;
  cliOptions: CreateCliClientOptions;
  destroy: () => Promise<void>;
}

export interface LocalProjectHarness extends CliTestHarness {
  projectDir: string;
  projectCredentialsPath: string;
}

function makeJwt(expOffsetSec = 7200): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + expOffsetSec,
      sub: MOCK_IDS.user_id,
      organization_id: MOCK_IDS.organization_id,
    })
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

export async function createCliTestHarness(
  configOverrides?: Record<string, unknown>
): Promise<CliTestHarness> {
  const configDir = join(
    tmpdir(),
    `loxtep-cli-harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const configPath = join(configDir, 'config.json');
  const credentialsPath = join(configDir, 'credentials.json');
  await mkdir(configDir, { recursive: true });

  const config = {
    api_url: MOCK_PLATFORM_API,
    organization_id: MOCK_IDS.organization_id,
    project_id: 'project-test-001',
    instance_id: MOCK_IDS.instance_id,
    ...configOverrides,
  };
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

  const token = makeJwt();
  await writeFile(
    credentialsPath,
    JSON.stringify(
      {
        access_token: token,
        refresh_token: 'mock-refresh-token',
        expires_at: new Date(Date.now() + 7200_000).toISOString(),
        api_base_url: MOCK_PLATFORM_API,
      },
      null,
      2
    ),
    'utf-8'
  );

  const fetchFn = createPlatformMockFetch();
  const cliOptions: CreateCliClientOptions = {
    configFilePath: configPath,
    credentialsPath,
    fetch_fn: fetchFn,
  };

  return {
    configDir,
    configPath,
    credentialsPath,
    fetchFn,
    cliOptions,
    destroy: async () => {
      if (existsSync(configDir)) {
        await rm(configDir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Harness with an attached Loxtep project directory for init/attach/generate/deploy/test.
 */
export async function createLocalProjectHarness(
  configOverrides?: Record<string, unknown>
): Promise<LocalProjectHarness> {
  const base = await createCliTestHarness(configOverrides);
  const projectDir = join(base.configDir, 'project');
  const loxtepDir = join(projectDir, '.loxtep');
  const projectCredentialsPath = join(loxtepDir, 'credentials.json');
  await mkdir(join(projectDir, 'workflows'), { recursive: true });
  await mkdir(loxtepDir, { recursive: true });

  const projectConfig = {
    project_id: 'project-test-001',
    organization_id: MOCK_IDS.organization_id,
    instance_id: MOCK_IDS.instance_id,
    api_url: MOCK_PLATFORM_API,
  };
  await writeFile(join(loxtepDir, 'project.json'), JSON.stringify(projectConfig, null, 2), 'utf-8');
  await writeFile(projectCredentialsPath, await readFile(base.credentialsPath, 'utf-8'), 'utf-8');

  const cliOptions: CreateCliClientOptions = {
    ...base.cliOptions,
    cwd: projectDir,
    credentialsPath: projectCredentialsPath,
  };

  return {
    ...base,
    projectDir,
    projectCredentialsPath,
    cliOptions,
  };
}

/** Minimal webhook workflow module (no external resource refs) for deploy/test integration. */
export async function writeMinimalWorkflowModule(
  projectDir: string,
  name = 'echo-test'
): Promise<string> {
  const filePath = join(projectDir, 'workflows', `${name}.js`);
  const source = `const workflow = {
  name: '${name}',
  triggers: [{ kind: 'webhook', path: '/test/${name}' }],
  async handler() {},
};
module.exports = workflow;
module.exports.default = workflow;
`;
  await writeFile(filePath, source, 'utf-8');
  return filePath;
}

export interface CapturedCliOutput {
  stdout: string;
  stderr: string;
  text: string;
  restore: () => void;
}

/** Capture console.log / console.error for CLI command assertions. */
export function captureCliOutput(): CapturedCliOutput {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const logSpy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdoutLines.push(args.map(String).join(' '));
  });
  const errSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderrLines.push(args.map(String).join(' '));
  });
  return {
    get stdout() {
      return stdoutLines.join('\n');
    },
    get stderr() {
      return stderrLines.join('\n');
    },
    get text() {
      return `${stdoutLines.join('\n')}\n${stderrLines.join('\n')}`.trim();
    },
    restore: () => {
      logSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}

/** Parse JSON printed by commands (handles pretty-printed single objects). */
export function parseCliJson(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) throw new Error('Empty CLI output');
  return JSON.parse(trimmed) as unknown;
}

/** Assert command succeeded and output contains substring(s). */
export function expectCliSuccess(output: CapturedCliOutput, ...contains: string[]): void {
  expect(process.exitCode ?? 0).toBe(0);
  for (const fragment of contains) {
    expect(output.text).toContain(fragment);
  }
}
