import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectClient, mergeMcpConfig, runStart, supportedNode } from './start-cmd';
import { SETUP_PROMPT } from '../setup-prompt';

describe('loxtep start', () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'loxtep-start-')); });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });
  it('checks Node before invoking installers', () => {
    expect(supportedNode('22.19.0')).toBe(false);
    expect(supportedNode('22.20.0')).toBe(true);
    expect(supportedNode('24.0.0')).toBe(true);
    const run = jest.fn();
    expect(() => runStart({ cwd, nodeVersion: '20.0.0', run })).toThrow('22.20');
    expect(run).not.toHaveBeenCalled();
  });
  it('uses explicit client and refuses ambiguous detection', () => {
    expect(detectClient(cwd, {}, () => true, 'codex')).toBe('codex');
    expect(() => detectClient(cwd, {}, () => true)).toThrow('Multiple agents');
    expect(detectClient(cwd, { CODEX_THREAD_ID: 'active' }, () => true)).toBe('codex');
  });
  it('preserves other servers and refuses conflicting Loxtep entries', () => {
    const merged = JSON.parse(mergeMcpConfig('{"theme":"dark","mcp":{"other":{"type":"local","command":["x"]}}}', 'opencode'));
    expect(merged.theme).toBe('dark');
    expect(merged.mcp.other.command).toEqual(['x']);
    expect(merged.mcp.loxtep.type).toBe('remote');
    expect(() => mergeMcpConfig('{"mcpServers":{"loxtep":{"command":"old"}}}', 'cursor')).toThrow('incompatible');
  });
  it('installs, configures, and launches with the canonical prompt; repeat runs preserve config', () => {
    const run = jest.fn();
    const options = { cwd, home: cwd, env: {}, nodeVersion: '22.20.0', available: () => true, client: 'opencode', run, log: jest.fn() };
    runStart(options);
    expect(run.mock.calls[0][0]).toBe('npx');
    expect(run.mock.calls[1]).toEqual(['opencode', ['--prompt', SETUP_PROMPT]]);
    const first = readFileSync(join(cwd, 'opencode.json'), 'utf8');
    runStart(options);
    expect(readFileSync(join(cwd, 'opencode.json'), 'utf8')).toBe(first);
    expect(run.mock.calls.some(([cmd]) => cmd === 'loxtep')).toBe(false);
  });
  it('reuses installed Claude skills instead of adding a duplicate native plugin', () => {
    for (const skill of ['loxtep-mcp-session', 'loxtep-auth', 'connect-external-system', 'data-workflows']) {
      const path = join(cwd, '.agents/skills', skill);
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'SKILL.md'), 'installed');
    }
    const run = jest.fn();
    runStart({ cwd, home: cwd, env: {}, client: 'claude', available: () => true, run, log: jest.fn(), noLaunch: true });
    expect(run).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(cwd, '.mcp.json'), 'utf8')).mcpServers.loxtep.type).toBe('http');
  });
  it('stops before config writes and launch if the skills installer fails', () => {
    const run = jest.fn(() => { throw new Error('installer failed'); });
    expect(() => runStart({ cwd, home: cwd, env: {}, client: 'opencode', available: () => true, run, log: jest.fn() })).toThrow('installer failed');
    expect(run).toHaveBeenCalledTimes(1);
    expect(() => readFileSync(join(cwd, 'opencode.json'))).toThrow();
  });
  it('does not install or launch after a configuration conflict', () => {
    mkdirSync(join(cwd, '.cursor'));
    writeFileSync(join(cwd, '.cursor/mcp.json'), '{"mcpServers":{"loxtep":{"url":"https://other.example"}}}');
    const run = jest.fn();
    expect(() => runStart({ cwd, client: 'cursor', available: () => true, run, log: jest.fn() })).toThrow('incompatible');
    expect(run).not.toHaveBeenCalled();
  });
  it('reuses Codex configuration without overwriting settings', () => {
    mkdirSync(join(cwd, '.codex'));
    const text = '[mcp_servers.loxtep]\nurl = "https://mcp.loxtep.io/ai/mcp/stream"\n\n[other]\nvalue = true\n';
    writeFileSync(join(cwd, '.codex/config.toml'), text);
    const run = jest.fn();
    runStart({ cwd, home: cwd, env: {}, client: 'codex', available: () => true, run, noLaunch: true, log: jest.fn() });
    expect(run.mock.calls.map(([cmd]) => cmd)).toEqual(['npx']);
    expect(readFileSync(join(cwd, '.codex/config.toml'), 'utf8')).toBe(text);
  });
});
