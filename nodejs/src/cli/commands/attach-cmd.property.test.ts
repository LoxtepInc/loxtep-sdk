import fc from 'fast-check';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAttach } from './attach-cmd.js';
import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { Instance } from '../../client/instances-types.js';
import type { Project } from '../../client/projects-types.js';

/**
 * Feature: ai-first-platform-surface
 * Property 4: Attach failure atomicity
 *
 * For any initial `.loxtep/project.json` content, when `loxtep attach` fails
 * (instance not found, auth error, network error), the file content remains
 * byte-identical to its pre-attach state.
 *
 * **Validates: Requirements 1.9**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary non-empty project_id. */
const projectIdArb = fc.stringMatching(/^proj_[a-z0-9]{4,16}$/);

/** Arbitrary instance_id for the --instance flag. */
const instanceIdArb = fc.stringMatching(/^inst_[a-z0-9]{4,16}$/);

/** Arbitrary optional fields that may appear in project.json. */
const optionalFieldsArb = fc.record({
  organization_id: fc.option(fc.stringMatching(/^org_[a-z0-9]{4,12}$/), { nil: undefined }),
  instance_id: fc.option(fc.stringMatching(/^inst_[a-z0-9]{4,12}$/), { nil: undefined }),
  api_url: fc.option(fc.stringMatching(/^https:\/\/api[a-z]{0,4}\.loxtep\.io$/), { nil: undefined }),
  template_slug: fc.option(fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/), { nil: undefined }),
});

/**
 * Arbitrary valid project.json content — generates a variety of initial states
 * (bare project, partially attached, fully attached) to prove that no matter
 * what the file looks like before attach, a failure leaves it unchanged.
 */
const projectConfigArb = fc.tuple(projectIdArb, optionalFieldsArb).map(([project_id, opts]) => {
  const config: Record<string, unknown> = { project_id };
  if (opts.organization_id !== undefined) config.organization_id = opts.organization_id;
  if (opts.instance_id !== undefined) config.instance_id = opts.instance_id;
  if (opts.api_url !== undefined) config.api_url = opts.api_url;
  if (opts.template_slug !== undefined) config.template_slug = opts.template_slug;
  return config;
});

/**
 * Arbitrary failure reason — models the three failure categories from R1.9:
 * instance does not exist, developer is not authenticated, platform is unreachable.
 */
const failureReasonArb = fc.constantFrom(
  'Instance not found',
  'Instance does not exist',
  'Unauthorized: token expired',
  'Authentication required',
  'Network error: ECONNREFUSED',
  'Platform unreachable: timeout',
  'Request failed with status 503',
  'ENOTFOUND mcp.loxtep.io'
);

/**
 * Arbitrary failure stage — models at which point the attach process fails:
 * - resolveInstance: instance.get or instance.list throws
 * - fetchProject: projects.get throws (after instance resolves)
 */
const failureStageArb = fc.constantFrom('resolveInstance', 'fetchProject') as fc.Arbitrary<
  'resolveInstance' | 'fetchProject'
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `loxtep-pbt-attach-atomicity-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function scaffoldProject(dir: string, config: Record<string, unknown>): string {
  const loxtepDir = join(dir, '.loxtep');
  mkdirSync(loxtepDir, { recursive: true });
  const filePath = join(loxtepDir, 'project.json');
  writeFileSync(filePath, JSON.stringify(config, null, 2));
  return filePath;
}

function makeInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    instance_id: 'inst_abc123',
    organization_id: 'org_xyz',
    name: 'sandbox',
    api_url: 'https://api.loxtep.io',
    region: 'us-east-1',
    stack_id: 'stack-1',
    status: 'active',
    connection_details: {},
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    project_id: 'proj_test1',
    organization_id: 'org_xyz',
    name: 'Test Project',
    status: 'active',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Build a mock LoxtepClient that fails at the specified stage with the given reason.
 */
function mockFailingClient(
  stage: 'resolveInstance' | 'fetchProject',
  reason: string,
  instanceId?: string
): LoxtepClient {
  return {
    instances: {
      list: async () => {
        if (stage === 'resolveInstance' && !instanceId) {
          throw new Error(reason);
        }
        return {
          items: [makeInstance()],
          pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
        };
      },
      get: async (_id: string) => {
        if (stage === 'resolveInstance') {
          throw new Error(reason);
        }
        return makeInstance();
      },
      get_stream_config: async () => ({} as any),
    },
    projects: {
      get: async (_id: string) => {
        if (stage === 'fetchProject') {
          throw new Error(reason);
        }
        return makeProject();
      },
      list: async () => [],
      create: async () => makeProject(),
      update: async () => makeProject(),
      delete: async () => ({ project_id: 'proj_test1', deleted: true }),
      applyTemplate: async () => ({} as any),
    },
  } as unknown as LoxtepClient;
}

// ─── Property Test ────────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 4: Attach failure atomicity', () => {
  const tmpDirs: string[] = [];

  afterAll(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it(
    'R1.9: For any initial project.json content, when attach fails (instance not found, ' +
      'auth error, or network error), the file content remains byte-identical to its pre-attach state',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          projectConfigArb,
          failureStageArb,
          failureReasonArb,
          instanceIdArb,
          async (config, stage, reason, explicitInstanceId) => {
            // 1. Set up a temp directory with the arbitrary initial project.json content.
            const dir = makeTmpDir();
            tmpDirs.push(dir);
            const filePath = scaffoldProject(dir, config);

            // 2. Capture the byte content before the attach attempt.
            const contentBefore = readFileSync(filePath);

            // 3. Create a client that will fail at the specified stage.
            const client = mockFailingClient(stage, reason, explicitInstanceId);

            // 4. Run attach — it should fail.
            const result = await runAttach(client, { cwd: dir, instanceId: explicitInstanceId });

            // 5. Assert non-zero exit code (R1.9: SHALL exit with non-zero status code).
            expect(result.exitCode).not.toBe(0);

            // 6. Assert error message is present (R1.9: SHALL print an error message
            //    identifying the failure reason).
            expect(result.stderr.length).toBeGreaterThan(0);
            expect(result.stderr.join(' ').length).toBeGreaterThan(0);

            // 7. Assert file is byte-identical (R1.9: SHALL leave .loxtep/project.json unchanged).
            const contentAfter = readFileSync(filePath);
            expect(Buffer.compare(contentBefore, contentAfter)).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    },
    60_000
  );
});
