import fc from 'fast-check';
import { projectToRepository } from './attach-cmd.js';
import type { Project } from '../../client/projects-types.js';

/**
 * Feature: ai-first-platform-surface
 * Property 41: Attach projects the binding into `.loxtep/project.json` for bound projects and omits it otherwise
 *
 * For any project record:
 * - When `github_repo_url` AND `github_repo_name` are both present and non-empty,
 *   `projectToRepository` returns a `ProjectRepository` with url, name, branch
 *   (defaulting to 'main'), and optional subpath.
 * - When either `github_repo_url` or `github_repo_name` is absent/empty,
 *   `projectToRepository` returns `undefined` (the repository block is omitted).
 *
 * **Validates: Requirements 17.2, 17.3**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary non-empty GitHub URL. */
const githubUrlArb = fc.stringMatching(/^https:\/\/github\.com\/[a-z][a-z0-9-]{0,20}\/[a-z][a-z0-9-]{0,20}$/);

/** Arbitrary non-empty GitHub repo name (org/repo format). */
const githubNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\/[a-z][a-z0-9-]{0,20}$/);

/** Arbitrary branch name (non-empty). */
const branchArb = fc.stringMatching(/^[a-z][a-z0-9/_-]{0,30}$/);

/** Arbitrary repo subpath (non-empty). */
const subpathArb = fc.stringMatching(/^[a-z][a-z0-9/_-]{0,40}$/);

/** Base project fields that every test project needs. */
function makeBaseProject(overrides: Partial<Project> = {}): Project {
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
 * Arbitrary for a "bound" project — both github_repo_url and github_repo_name
 * are present and non-empty.
 */
const boundProjectArb = fc
  .record({
    url: githubUrlArb,
    name: githubNameArb,
    branch: fc.option(branchArb, { nil: undefined }),
    subpath: fc.option(subpathArb, { nil: undefined }),
  })
  .map(({ url, name, branch, subpath }) =>
    makeBaseProject({
      github_repo_url: url,
      github_repo_name: name,
      github_branch: branch,
      github_repo_path: subpath,
    })
  );

/**
 * Arbitrary for an "unbound" project — at least one of github_repo_url or
 * github_repo_name is absent or empty.
 */
const unboundProjectArb = fc
  .record({
    urlVariant: fc.constantFrom('missing', 'empty', 'present') as fc.Arbitrary<'missing' | 'empty' | 'present'>,
    nameVariant: fc.constantFrom('missing', 'empty', 'present') as fc.Arbitrary<'missing' | 'empty' | 'present'>,
    url: githubUrlArb,
    name: githubNameArb,
    branch: fc.option(branchArb, { nil: undefined }),
    subpath: fc.option(subpathArb, { nil: undefined }),
  })
  .filter(({ urlVariant, nameVariant }) => {
    // At least one must be missing or empty for the project to be unbound
    return urlVariant !== 'present' || nameVariant !== 'present';
  })
  .map(({ urlVariant, nameVariant, url, name, branch, subpath }) => {
    const overrides: Partial<Project> = {
      github_branch: branch,
      github_repo_path: subpath,
    };

    if (urlVariant === 'missing') {
      overrides.github_repo_url = undefined;
    } else if (urlVariant === 'empty') {
      overrides.github_repo_url = '';
    } else {
      overrides.github_repo_url = url;
    }

    if (nameVariant === 'missing') {
      overrides.github_repo_name = undefined;
    } else if (nameVariant === 'empty') {
      overrides.github_repo_name = '';
    } else {
      overrides.github_repo_name = name;
    }

    return makeBaseProject(overrides);
  });

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 41: Attach projects the binding into .loxtep/project.json for bound projects and omits it otherwise', () => {
  it(
    'R17.2: For any bound project (github_repo_url + github_repo_name both present and non-empty), ' +
      'projectToRepository returns a repository block with url, name, and branch',
    () => {
      fc.assert(
        fc.property(boundProjectArb, (project) => {
          const result = projectToRepository(project);

          // Must return a defined repository block
          expect(result).toBeDefined();
          expect(result!.url).toBe(project.github_repo_url);
          expect(result!.name).toBe(project.github_repo_name);

          // Branch defaults to 'main' when github_branch is absent/empty
          if (project.github_branch && project.github_branch.length > 0) {
            expect(result!.branch).toBe(project.github_branch);
          } else {
            expect(result!.branch).toBe('main');
          }

          // Subpath is included only when github_repo_path is non-empty
          if (project.github_repo_path && project.github_repo_path.length > 0) {
            expect(result!.subpath).toBe(project.github_repo_path);
          } else {
            expect(result!.subpath).toBeUndefined();
          }
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R17.3: For any unbound project (github_repo_url or github_repo_name is absent or empty), ' +
      'projectToRepository returns undefined (repository block is omitted)',
    () => {
      fc.assert(
        fc.property(unboundProjectArb, (project) => {
          const result = projectToRepository(project);
          expect(result).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    }
  );
});
