/**
 * Feature: ai-first-platform-surface
 * Property 40: Init repository flags map to the correct `github_action`
 *
 * For all combinations of `--create-repo` and `--from-repo` flag inputs,
 * the pure `repoFlagsToGithubAction` mapping produces:
 *   - `--create-repo` present (string or boolean true) → `{ ok: true, action: 'create_new' }`
 *   - `--from-repo` present (non-empty string) → `{ ok: true, action: 'import_existing' }`
 *   - neither flag present → `{ ok: true, action: 'none' }`
 *   - both flags present → `{ ok: false }` (rejection)
 *
 * **Validates: Requirements 17.4, 17.5, 17.6**
 */

import fc from 'fast-check';
import { repoFlagsToGithubAction } from './init-cmd.js';
import type { RepoFlagInput } from './init-cmd.js';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary non-empty string representing a repo name for --create-repo */
const repoNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/);

/** Arbitrary non-empty URL-like string for --from-repo */
const repoUrlArb = fc.oneof(
  fc.webUrl(),
  fc.constant('https://github.com/org/repo'),
  fc.stringMatching(/^https:\/\/github\.com\/[a-z]{1,10}\/[a-z0-9-]{1,30}$/)
);

/** Arbitrary --create-repo value: either a non-empty string or boolean true */
const createRepoValueArb: fc.Arbitrary<string | boolean> = fc.oneof(repoNameArb, fc.constant(true));

// ─── Property Test ────────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 40: Init repository flags map to the correct github_action', () => {
  it(
    'R17.4: --create-repo (string or true) maps to action create_new with private default',
    () => {
      fc.assert(
        fc.property(createRepoValueArb, (createRepo) => {
          const input: RepoFlagInput = { createRepo };
          const result = repoFlagsToGithubAction(input);

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.action).toBe('create_new');
            // When createRepo is a string, repoName should be that string
            if (typeof createRepo === 'string') {
              expect(result.repoName).toBe(createRepo);
            } else {
              // Boolean true → repoName is undefined (private default, name auto-generated)
              expect(result.repoName).toBeUndefined();
            }
          }
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R17.5: --from-repo <url> maps to action import_existing',
    () => {
      fc.assert(
        fc.property(repoUrlArb, (fromRepo) => {
          const input: RepoFlagInput = { fromRepo };
          const result = repoFlagsToGithubAction(input);

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.action).toBe('import_existing');
            expect(result.importUrl).toBe(fromRepo);
          }
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R17.6: neither flag maps to action none',
    () => {
      // Test various "absent" representations: undefined, false, empty string
      const absentCreateRepoArb = fc.oneof(
        fc.constant(undefined),
        fc.constant(false)
      );
      const absentFromRepoArb = fc.oneof(
        fc.constant(undefined),
        fc.constant('')
      );

      fc.assert(
        fc.property(absentCreateRepoArb, absentFromRepoArb, (createRepo, fromRepo) => {
          const input: RepoFlagInput = {};
          if (createRepo !== undefined) (input as Record<string, unknown>).createRepo = createRepo;
          if (fromRepo !== undefined) (input as Record<string, unknown>).fromRepo = fromRepo;

          const result = repoFlagsToGithubAction(input);

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.action).toBe('none');
          }
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'R17.6: both flags present simultaneously is rejected',
    () => {
      fc.assert(
        fc.property(createRepoValueArb, repoUrlArb, (createRepo, fromRepo) => {
          const input: RepoFlagInput = { createRepo, fromRepo };
          const result = repoFlagsToGithubAction(input);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(typeof result.error).toBe('string');
            expect(result.error.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    }
  );
});
