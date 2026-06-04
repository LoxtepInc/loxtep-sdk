import fc from 'fast-check';
import { defineDataWorkflow } from './define-data-workflow';
import { ValidationError } from '../errors/index';
import type { DataWorkflowModule, TriggerSpec } from './types';

/**
 * Feature: ai-first-platform-surface
 * Property 11: defineDataWorkflow input validation
 *
 * For arbitrary invalid specs — name outside 1–64 characters, trigger count
 * outside 1–10, requireApproval count > 100, or requireApproval entries outside
 * 1–256 characters — `defineDataWorkflow` throws a `ValidationError` that names
 * the bad argument.
 *
 * **Validates: Requirements 3.1, 3.8, 6.1**
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A valid trigger for composing test specs. */
const validTrigger: TriggerSpec = { kind: 'schedule', schedule: '0 * * * *' };

/** A no-op handler. */
const validHandler = async () => {};

/** Build a valid spec, then apply overrides for the property under test. */
function baseSpec(overrides: Partial<DataWorkflowModule> = {}): DataWorkflowModule {
  return {
    name: 'valid-name',
    triggers: [validTrigger],
    handler: validHandler,
    ...overrides,
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary name that is too short (empty string). */
const nameTooShortArb = fc.constant('');

/** Arbitrary name that is too long (65–200 chars). */
const nameTooLongArb = fc.integer({ min: 65, max: 200 }).map(len => 'x'.repeat(len));

/** Arbitrary invalid name: either too short or too long. */
const invalidNameArb = fc.oneof(nameTooShortArb, nameTooLongArb);

/** Arbitrary valid name (1–64 chars). */
const validNameArb = fc.integer({ min: 1, max: 64 }).map(len => 'n'.repeat(len));

/** Arbitrary trigger array with 0 entries (too few). */
const triggersTooFewArb = fc.constant([] as TriggerSpec[]);

/** Arbitrary trigger array with 11–20 entries (too many). */
const triggersTooManyArb = fc
  .integer({ min: 11, max: 20 })
  .map(count => Array.from({ length: count }, () => validTrigger));

/** Arbitrary invalid trigger count: either 0 or 11–20. */
const invalidTriggersArb = fc.oneof(triggersTooFewArb, triggersTooManyArb);

/** Arbitrary valid trigger array (1–10 entries). */
const validTriggersArb = fc
  .integer({ min: 1, max: 10 })
  .map(count => Array.from({ length: count }, () => validTrigger));

/** Arbitrary requireApproval with more than 100 entries (101–150). */
const requireApprovalTooManyArb = fc
  .integer({ min: 101, max: 150 })
  .map(count => Array.from({ length: count }, (_, i) => `op-${i}`));

/** Arbitrary requireApproval containing at least one entry outside 1–256 chars. */
const requireApprovalBadEntryArb = fc.oneof(
  // Contains an empty string
  fc.integer({ min: 0, max: 10 }).map(validCount => {
    const entries = Array.from({ length: validCount }, (_, i) => `op-${i}`);
    entries.push(''); // inject empty entry
    return entries;
  }),
  // Contains an entry > 256 chars
  fc.tuple(
    fc.integer({ min: 0, max: 10 }),
    fc.integer({ min: 257, max: 400 }),
  ).map(([validCount, badLen]) => {
    const entries = Array.from({ length: validCount }, (_, i) => `op-${i}`);
    entries.push('x'.repeat(badLen)); // inject oversized entry
    return entries;
  }),
);

/** Arbitrary invalid requireApproval: either too many entries or a bad entry. */
const invalidRequireApprovalArb = fc.oneof(
  requireApprovalTooManyArb,
  requireApprovalBadEntryArb,
);

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 11: defineDataWorkflow input validation', () => {
  it(
    'R3.1, R3.8: rejects names outside 1–64 characters with a ValidationError naming "name"',
    () => {
      fc.assert(
        fc.property(invalidNameArb, validTriggersArb, (name, triggers) => {
          const spec = baseSpec({ name, triggers });
          try {
            defineDataWorkflow(spec);
            // Should not reach here
            return false;
          } catch (e) {
            if (!(e instanceof ValidationError)) return false;
            // The error must name the "name" field
            return e.field_errors.some(fe => fe.field === 'name');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R3.1, R3.8: rejects trigger count outside 1–10 with a ValidationError naming "triggers"',
    () => {
      fc.assert(
        fc.property(validNameArb, invalidTriggersArb, (name, triggers) => {
          const spec = baseSpec({ name, triggers });
          try {
            defineDataWorkflow(spec);
            return false;
          } catch (e) {
            if (!(e instanceof ValidationError)) return false;
            return e.field_errors.some(fe => fe.field === 'triggers');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R6.1: rejects requireApproval with > 100 entries or entries outside 1–256 chars with a ValidationError naming "requireApproval"',
    () => {
      fc.assert(
        fc.property(
          validNameArb,
          validTriggersArb,
          invalidRequireApprovalArb,
          (name, triggers, requireApproval) => {
            const spec = baseSpec({ name, triggers, requireApproval });
            try {
              defineDataWorkflow(spec);
              return false;
            } catch (e) {
              if (!(e instanceof ValidationError)) return false;
              return e.field_errors.some(fe => fe.field === 'requireApproval');
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Positive: valid specs (name 1–64, triggers 1–10, requireApproval ≤100 entries each 1–256 chars) do not throw',
    () => {
      const validRequireApprovalArb = fc.oneof(
        fc.constant(undefined as string[] | undefined),
        fc
          .tuple(
            fc.integer({ min: 0, max: 100 }),
            fc.integer({ min: 1, max: 256 }),
          )
          .map(([count, entryLen]) =>
            Array.from({ length: count }, () => 'a'.repeat(entryLen)),
          ),
      );

      fc.assert(
        fc.property(
          validNameArb,
          validTriggersArb,
          validRequireApprovalArb,
          (name, triggers, requireApproval) => {
            const spec = baseSpec({ name, triggers, requireApproval });
            const result = defineDataWorkflow(spec);
            return result === spec;
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
