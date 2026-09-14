/**
 * Basic CLI tests (help, config list). Built-dist smoke only.
 * Auth integration: cli-auth-flow.test.ts · command registry: cli-command-coverage.test.ts
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const cliPath = join(process.cwd(), 'dist', 'cli', 'index.js');
const distExists = existsSync(cliPath);

function runCli(args: string[]): string {
  // Child must not inherit JEST_WORKER_ID — the CLI bin skips auto-run when it
  // is set so Jest can import `runCli` without executing process.argv.
  const env = { ...process.env };
  delete env.JEST_WORKER_ID;
  return execSync(`node "${cliPath}" ${args.map(a => `"${a}"`).join(' ')}`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024,
    env,
  });
}

(distExists ? describe : describe.skip)('CLI', () => {
  it('should print help for --help', () => {
    const out = runCli(['--help']);
    expect(out).toContain('Usage: loxtep');
    expect(out).toContain('Authentication');
    expect(out).toContain('Build & deploy');
    expect(out).toContain('login');
    expect(out).toContain('config');
    expect(out).toContain('--version');
  });

  it('should print package version for --version', () => {
    const out = runCli(['--version']).trim();
    expect(out).toMatch(/^@loxtep\/sdk \d+\.\d+\.\d+/);
  });

  it('should run config list and show keys', () => {
    const out = runCli(['config', 'list']);
    expect(out).toContain('api_url:');
    expect(out).toContain('organization_id:');
    expect(out).toContain('project_id:');
    expect(out).toContain('instance_id:');
  });
});
