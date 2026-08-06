import { normalizeDeployResponse } from './workflows-types.js';

describe('normalizeDeployResponse', () => {
  it('reads current flat envelope data', () => {
    expect(
      normalizeDeployResponse({
        success: true,
        data: {
          run_id: 'run-1',
          deployment_id: 'run-1',
          status: 'requested',
          message: 'Project deployment requested',
          project_id: 'proj-1',
        },
      })
    ).toEqual({
      run_id: 'run-1',
      deployment_id: 'run-1',
      version_id: undefined,
      status: 'requested',
      message: 'Project deployment requested',
      project_id: 'proj-1',
    });
  });

  it('aliases deployment_id to run_id for older mock/API shapes', () => {
    expect(
      normalizeDeployResponse({
        success: true,
        data: { deployment_id: 'deploy-001', status: 'in_progress' },
      })
    ).toMatchObject({
      run_id: 'deploy-001',
      deployment_id: 'deploy-001',
      status: 'in_progress',
    });
  });

  it('unwraps historical double-nested mishap responses', () => {
    expect(
      normalizeDeployResponse({
        success: true,
        data: {
          data: {
            success: true,
            data: {
              status: 'requested',
              message: 'Project deployment requested',
              project_id: 'proj-1',
            },
          },
        },
      })
    ).toMatchObject({
      status: 'requested',
      message: 'Project deployment requested',
      project_id: 'proj-1',
    });
  });

  it('defaults status to unknown when empty', () => {
    expect(normalizeDeployResponse({})).toEqual({
      run_id: undefined,
      deployment_id: undefined,
      version_id: undefined,
      status: 'unknown',
      message: undefined,
      project_id: undefined,
    });
  });
});
