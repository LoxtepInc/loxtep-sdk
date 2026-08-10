/**
 * CLI command test coverage registry.
 *
 * Read-only and mutating API-backed commands run against a mock platform in
 * `cli-integration.test.ts` and `cli-integration-mutations.test.ts`.
 * Local lifecycle commands run in `cli-local-integration.test.ts`.
 * Optional live smoke: `cli-staging-smoke.test.ts` (LOXTEP_CLI_SMOKE=1).
 */

type CoverageKind = 'integration' | 'unit' | 'smoke-dist' | 'smoke-staging' | 'none';

interface CommandCoverage {
  /** Primary test file(s) exercising this command. */
  tests: string[];
  kind: CoverageKind;
  notes?: string;
}

/**
 * Top-level `loxtep <command>` registry. Update when adding commands to index.ts.
 */
export const CLI_COMMAND_COVERAGE: Record<string, CommandCoverage> = {
  login: {
    kind: 'integration',
    tests: ['cli-auth-flow.test.ts', 'cli-e2e.test.ts', 'cli-integration.test.ts'],
  },
  logout: {
    kind: 'integration',
    tests: ['cli-integration.test.ts', 'cli-local-integration.test.ts', 'credentials.test.ts'],
    notes: 'credential file removal',
  },
  whoami: {
    kind: 'integration',
    tests: [
      'cli-auth-flow.test.ts',
      'cli-e2e.test.ts',
      'cli-integration.test.ts',
      'cli-staging-smoke.test.ts',
    ],
  },
  init: {
    kind: 'integration',
    tests: [
      'cli-local-integration.test.ts',
      'commands/init-cmd.test.ts',
      'commands/init-cmd.property.test.ts',
    ],
  },
  attach: {
    kind: 'integration',
    tests: [
      'cli-local-integration.test.ts',
      'commands/attach-cmd.test.ts',
      'commands/attach-cmd.property.test.ts',
      'commands/attach-cmd-binding.property.test.ts',
    ],
  },
  link: {
    kind: 'unit',
    tests: ['commands/link-cmd.test.ts', 'known-locals-registry.test.ts'],
    notes: 'projects link + known-locals registry (LOX-1186)',
  },
  status: {
    kind: 'unit',
    tests: [
      'commands/status-cmd.test.ts',
      '../client/project-workspace-status.test.ts',
    ],
    notes: 'cwd-first workspace status; distinct from observe status',
  },
  projects: {
    kind: 'unit',
    tests: [
      'commands/projects-cmd.test.ts',
      'commands/link-cmd.test.ts',
      'commands/clone-cmd.test.ts',
      '../client/project-workspace-status.test.ts',
    ],
    notes: 'list/get + link + clone + github pull/push wrappers (LOX-1188)',
  },
  generate: {
    kind: 'integration',
    tests: ['cli-local-integration.test.ts', 'commands/generate-cmd.test.ts'],
  },
  test: {
    kind: 'integration',
    tests: ['cli-local-integration.test.ts', 'commands/test-cmd.test.ts'],
  },
  deploy: {
    kind: 'integration',
    tests: [
      'cli-local-integration.test.ts',
      'commands/deploy-cmd.test.ts',
      'commands/deploy-cmd.property.test.ts',
    ],
  },
  config: {
    kind: 'integration',
    tests: [
      'cli-local-integration.test.ts',
      '__tests__/config-export.test.ts',
      'cli.test.ts',
    ],
    notes: 'cli.test.ts smoke: config list via dist',
  },
  'data-products': {
    kind: 'integration',
    tests: ['cli-integration.test.ts', 'cli-integration-mutations.test.ts'],
    notes: 'list/get/query/tables/readiness/promote/create',
  },
  workflows: {
    kind: 'integration',
    tests: ['cli-integration.test.ts', 'cli-integration-mutations.test.ts'],
    notes: 'list/get/create/deploy',
  },
  triggers: {
    kind: 'integration',
    tests: ['cli-integration.test.ts', 'cli-integration-mutations.test.ts'],
    notes: 'list/get/create/test',
  },
  domains: { kind: 'integration', tests: ['cli-integration.test.ts'] },
  standards: { kind: 'integration', tests: ['cli-integration.test.ts'] },
  'data-contracts': {
    kind: 'integration',
    tests: ['cli-integration.test.ts', 'cli-integration-mutations.test.ts'],
  },
  improvements: {
    kind: 'integration',
    tests: [
      'cli-integration.test.ts',
      'cli-integration-mutations.test.ts',
      'commands/improvements-cmd.test.ts',
      'commands/improvements-cmd.property.test.ts',
      'commands/improvements-cmd-reject.property.test.ts',
    ],
  },
  approvals: {
    kind: 'integration',
    tests: [
      'cli-integration.test.ts',
      'cli-integration-mutations.test.ts',
      'commands/approvals-cmd.test.ts',
      '../client/approvals.http.integration.test.ts',
      '../client/approvals.test.ts',
    ],
    notes:
      'list/approve/reject via mock-platform-api fixtures (MCP list_pending + resolve); optional live smoke LOXTEP_CLI_SMOKE=1',
  },
  cdlc: {
    kind: 'unit',
    tests: ['commands/cdlc-cmd.test.ts', 'client/cdlc.test.ts'],
    notes: 'transition + review-queue list (steward CDLC paths)',
  },
  deployments: {
    kind: 'unit',
    tests: ['commands/deployments-cmd.test.ts', 'client/deployments.test.ts'],
    notes: 'list/get — SDK observe.list_deployments / get_deployment',
  },
  activity: {
    kind: 'integration',
    tests: ['cli-integration.test.ts', 'commands/activity-cmd.test.ts'],
  },
  instances: {
    kind: 'integration',
    tests: [
      'cli-integration.test.ts',
      'cli-integration-mutations.test.ts',
      'commands/instances-cmd.test.ts',
    ],
  },
  observe: { kind: 'integration', tests: ['cli-integration.test.ts'], notes: 'status only' },
  queue: { kind: 'integration', tests: ['cli-integration.test.ts'], notes: 'info/checkpoint' },
  metrics: { kind: 'integration', tests: ['cli-integration.test.ts'], notes: 'rate-limits/log' },
  bus: { kind: 'none', tests: [], notes: 'placeholder command' },
  promises: { kind: 'none', tests: [], notes: 'deprecated alias for data-contracts' },
};

/** Commands that MUST have HTTP integration tests (auth/session contract). */
export const CLI_INTEGRATION_REQUIRED = ['login', 'whoami'] as const;

describe('CLI command coverage registry', () => {
  it('documents every top-level command exported in help', () => {
    const helpCommands = [
      'login',
      'logout',
      'whoami',
      'init',
      'link',
      'attach',
      'generate',
      'projects',
      'instances',
      'projects',
      'status',
      'test',
      'deploy',
      'workflows',
      'triggers',
      'data-products',
      'domains',
      'standards',
      'data-contracts',
      'approvals',
      'improvements',
      'cdlc',
      'deployments',
      'observe',
      'queue',
      'metrics',
      'activity',
      'config',
      'bus',
    ];
    for (const cmd of helpCommands) {
      expect(CLI_COMMAND_COVERAGE[cmd]).toBeDefined();
    }
  });

  it('requires login and whoami to have integration test files listed', () => {
    for (const cmd of CLI_INTEGRATION_REQUIRED) {
      const entry = CLI_COMMAND_COVERAGE[cmd];
      expect(entry.kind).toBe('integration');
      expect(
        entry.tests.some(
          t =>
            t.includes('auth-flow') ||
            t.includes('e2e') ||
            t.includes('integration') ||
            t.includes('staging-smoke')
        )
      ).toBe(true);
    }
  });

  it('surfaces commands with no automated CLI tests (intentional backlog)', () => {
    const untested = Object.entries(CLI_COMMAND_COVERAGE)
      .filter(([, v]) => v.kind === 'none')
      .map(([k]) => k);
    expect(untested.sort()).toEqual(['bus', 'promises'].sort());
  });
});
