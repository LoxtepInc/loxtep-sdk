/**
 * Property 42: Binding query returns the five fields with empty last-synced values when never synced
 *
 * For any project record where github_last_commit_sha and github_last_sync_at
 * are null or undefined (i.e. the project has never been synced), the
 * `client.projects.repository(projectId)` accessor returns empty strings for
 * `last_commit_sha` and `last_sync_at`.
 *
 * The property also verifies that the other binding fields (url, name, subpath,
 * branch) are correctly projected from the project record.
 *
 * **Validates: Requirements 17.12**
 *
 * Tagged: Feature: ai-first-platform-surface, Property 42: Binding query returns the five fields with empty last-synced values when never synced
 */

import fc from 'fast-check';
import { createProjectsApi } from '../projects';
import type { LoxtepHttpClient } from '../../http/client';

/* ------------------------------------------------------------------ */
/*  Arbitraries                                                       */
/* ------------------------------------------------------------------ */

/** Nullable variant: either null, undefined, or absent (represented as undefined). */
const nullishArb = fc.constantFrom(null, undefined);

/** A GitHub repo URL. */
const repoUrlArb = fc.oneof(
  fc
    .tuple(
      fc.constantFrom('https://github.com/', 'https://gitlab.com/'),
      fc.stringMatching(/^[a-z][a-z0-9-]{1,20}$/, { size: 'small' }),
      fc.constant('/'),
      fc.stringMatching(/^[a-z][a-z0-9_-]{1,20}$/, { size: 'small' }),
    )
    .map(([host, org, slash, repo]) => `${host}${org}${slash}${repo}`),
  fc.constant(undefined),
);

/** A repo name like "org/repo". */
const repoNameArb = fc.oneof(
  fc
    .tuple(
      fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/, { size: 'small' }),
      fc.stringMatching(/^[a-z][a-z0-9_-]{1,15}$/, { size: 'small' }),
    )
    .map(([org, repo]) => `${org}/${repo}`),
  fc.constant(undefined),
);

/** A subpath within the repo. */
const subpathArb = fc.oneof(
  fc.constant(''),
  fc.constant(undefined),
  fc.stringMatching(/^[a-z][a-z0-9/._-]{0,30}$/, { size: 'small' }),
);

/** A branch name. */
const branchArb = fc.oneof(
  fc.constant(undefined),
  fc.constant('main'),
  fc.constant('develop'),
  fc.stringMatching(/^[a-z][a-z0-9/_-]{1,20}$/, { size: 'small' }),
);

/** Project ID. */
const projectIdArb = fc.stringMatching(/^proj_[a-z0-9]{4,16}$/, { size: 'small' });

/**
 * A project record where the sync state fields are null/undefined (never synced).
 * The repo binding fields (url, name, subpath, branch) can be anything.
 */
const neverSyncedProjectArb = fc.record({
  project_id: projectIdArb,
  organization_id: fc.stringMatching(/^org_[a-z0-9]{4,12}$/, { size: 'small' }),
  name: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{0,30}$/, { size: 'small' }),
  status: fc.constantFrom('active' as const, 'inactive' as const, 'archived' as const),
  is_active: fc.boolean(),
  created_at: fc.constant('2025-01-01T00:00:00Z'),
  updated_at: fc.constant('2025-06-01T00:00:00Z'),
  github_repo_url: repoUrlArb,
  github_repo_name: repoNameArb,
  github_repo_path: subpathArb,
  github_branch: branchArb,
  // Never synced: both are null or undefined
  github_last_commit_sha: nullishArb,
  github_last_sync_at: nullishArb,
});

/* ------------------------------------------------------------------ */
/*  Property 42                                                       */
/* ------------------------------------------------------------------ */

describe('Feature: ai-first-platform-surface, Property 42: Binding query returns the five fields with empty last-synced values when never synced', () => {
  it('returns empty strings for last_commit_sha and last_sync_at when project has never been synced', async () => {
    await fc.assert(
      fc.asyncProperty(neverSyncedProjectArb, async (project) => {
        // --- Arrange: mock HTTP client returning the project record ---
        const http = {
          get: async () => ({ success: true as const, data: project }),
        } as unknown as LoxtepHttpClient;

        const api = createProjectsApi(http);

        // --- Act ---
        const binding = await api.repository(project.project_id);

        // --- Assert: last-synced fields are empty strings (R17.12) ---
        expect(binding.last_commit_sha).toBe('');
        expect(binding.last_sync_at).toBe('');

        // --- Assert: other binding fields are correctly projected ---
        expect(binding.url).toBe(project.github_repo_url ?? null);
        expect(binding.name).toBe(project.github_repo_name ?? null);
        expect(binding.subpath).toBe(project.github_repo_path ?? '');
        expect(binding.branch).toBe(project.github_branch ?? 'main');
      }),
      { numRuns: 100 },
    );
  });
});
