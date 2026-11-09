import { formatTrackingLines, trackingHandleFromDeployResult } from './deploy-cmd.js';

describe('deploy tracking output', () => {
  it('leads with the platform message when the deploy joined one already running', () => {
    const handle = trackingHandleFromDeployResult({
      run_id: 'run-running',
      status: 'in_progress',
      joined: true,
      message: 'This project is already deploying. Your latest changes will deploy as soon as it finishes.',
    })!;

    const lines = formatTrackingLines(handle);

    expect(lines[0]).toBe(
      'This project is already deploying. Your latest changes will deploy as soon as it finishes.'
    );
    expect(lines[1]).toBe('Deployment tracking: run_id=run-running, status=in_progress');
  });

  it('prints no joined line for a new deploy', () => {
    const handle = trackingHandleFromDeployResult({ run_id: 'run-new', status: 'requested' })!;

    expect(formatTrackingLines(handle)[0]).toBe(
      'Deployment tracking: run_id=run-new, status=requested'
    );
  });
});
