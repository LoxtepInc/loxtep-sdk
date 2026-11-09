import { resolveDeployTokenInputs } from './deploy-token-resolve.js';

const PROJ = '33333333-3333-4333-8333-333333333333';

describe('resolveDeployTokenInputs', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns null when LOXTEP_DEPLOY_TOKEN is unset (falls through to interactive auth)', () => {
    delete process.env.LOXTEP_DEPLOY_TOKEN;
    expect(resolveDeployTokenInputs()).toBeNull();
  });

  it('reads token + project + actor from env', () => {
    process.env.LOXTEP_DEPLOY_TOKEN = 'lxdt_abc';
    process.env.LOXTEP_PROJECT_ID = PROJ;
    process.env.LOXTEP_ACTOR = 'ci-bot';
    const r = resolveDeployTokenInputs();
    expect(r).toEqual({ deploy_token: 'lxdt_abc', project_id: PROJ, actor: 'ci-bot' });
  });

  it('lets a --project flag win over LOXTEP_PROJECT_ID', () => {
    process.env.LOXTEP_DEPLOY_TOKEN = 'lxdt_abc';
    process.env.LOXTEP_PROJECT_ID = 'env-project';
    const r = resolveDeployTokenInputs({ projectId: PROJ });
    expect(r?.project_id).toBe(PROJ);
  });

  it('falls back to the workspace config project_id when neither flag nor env is set', () => {
    process.env.LOXTEP_DEPLOY_TOKEN = 'lxdt_abc';
    delete process.env.LOXTEP_PROJECT_ID;
    const r = resolveDeployTokenInputs({ configProjectId: PROJ });
    expect(r?.project_id).toBe(PROJ);
  });

  it('throws when a deploy token is set but no project can be resolved', () => {
    process.env.LOXTEP_DEPLOY_TOKEN = 'lxdt_abc';
    delete process.env.LOXTEP_PROJECT_ID;
    expect(() => resolveDeployTokenInputs()).toThrow(/no project was resolved/i);
  });
});
