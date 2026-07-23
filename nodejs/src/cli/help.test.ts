import { CLI_HELP } from './help.js';

describe('CLI help', () => {
  it('groups commands under MCP-aligned facade headers', () => {
    expect(CLI_HELP).toContain('Session (client.session · loxtep_session)');
    expect(CLI_HELP).toContain('Workspace (client.workspace · loxtep_workspace)');
    expect(CLI_HELP).toContain('Build (client.build · loxtep_build)');
    expect(CLI_HELP).toContain('Define (client.define · loxtep_define)');
    expect(CLI_HELP).toContain('Review (client.review · loxtep_review)');
    expect(CLI_HELP).toContain('Query (client.query · loxtep_query)');
    expect(CLI_HELP).toContain('Observe (client.observe · loxtep_observe)');
    expect(CLI_HELP).toContain('Context (client.context · loxtep_context)');
  });

  it('lists core lifecycle commands under workspace and build', () => {
    expect(CLI_HELP).toContain('init [--template <slug>]');
    expect(CLI_HELP).toContain('attach [--instance <id>]');
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
