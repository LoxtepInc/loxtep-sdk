import { formatWorkspaceScopePinLines } from './workspace-scope-pin.js';

describe('formatWorkspaceScopePinLines', () => {
  it('prints attached Instance scope and MCP URI', () => {
    const lines = formatWorkspaceScopePinLines({
      project_id: 'proj-1',
      organization_id: 'org-1',
      instance_id: 'inst-1',
      environment_key: 'stage',
      attached: true,
    });
    expect(lines.join('\n')).toContain('Project id: proj-1');
    expect(lines.join('\n')).toContain('Instance id: inst-1');
    expect(lines.join('\n')).toContain('Instance environment_key: stage');
    expect(lines.join('\n')).toContain(
      'loxtep://workspace_context?project_id=proj-1&instance_id=inst-1'
    );
  });

  it('prints unattached guidance', () => {
    const lines = formatWorkspaceScopePinLines({
      project_id: 'proj-1',
      organization_id: null,
      instance_id: null,
      environment_key: null,
      attached: false,
    });
    expect(lines.join('\n')).toContain('not attached');
    expect(lines.join('\n')).toContain('loxtep attach --instance');
  });
});