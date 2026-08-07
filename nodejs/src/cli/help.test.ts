import { CLI_HELP } from './help.js';

describe('CLI help', () => {
  it('groups commands under customer-facing section headers', () => {
    expect(CLI_HELP).toContain('Authentication');
    expect(CLI_HELP).toContain('Workspace');
    expect(CLI_HELP).toContain('Build & deploy');
    expect(CLI_HELP).toContain('Governance');
    expect(CLI_HELP).toContain('Review');
    expect(CLI_HELP).toContain('Analytics');
    expect(CLI_HELP).toContain('Observe');
    expect(CLI_HELP).toContain('Activity');
    expect(CLI_HELP).toContain('Configuration');
  });

  it('does not expose internal MCP facade names', () => {
    expect(CLI_HELP).not.toMatch(/loxtep_/);
    expect(CLI_HELP).not.toMatch(/client\.\w+/);
    expect(CLI_HELP).not.toContain('MCP');
    expect(CLI_HELP).not.toContain('facade');
  });

  it('lists core lifecycle commands under workspace and build', () => {
    expect(CLI_HELP).toContain('init [--template <slug>]');
    expect(CLI_HELP).toContain('attach [--instance <id>]');
    expect(CLI_HELP).toContain('status [--json]');
    expect(CLI_HELP).toContain(
      'projects list [--source local|remote|all] | get <id> | link <id|name> [--path <dir>]'
    );
    expect(CLI_HELP).toContain('| clone <id|name> [dir] | pull | push');
    expect(CLI_HELP).toContain('link <project_id|name> [--path <dir>]');
    expect(CLI_HELP).toContain('generate');
    expect(CLI_HELP).toContain('test <module> --event <file>');
    expect(CLI_HELP).toContain('deploy');
    expect(CLI_HELP).toContain('workflows list');
    expect(CLI_HELP).toContain('data-products list');
  });

  it('uses pnpm in examples', () => {
    expect(CLI_HELP).toContain('pnpm exec loxtep login');
  });
});
