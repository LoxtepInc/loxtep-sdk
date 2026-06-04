import fc from 'fast-check';
import { validateAgentOptions } from './agent';
import { ValidationError } from '../errors/index';
import type { AgentOptions, SkillRef } from './agent';

/**
 * Feature: ai-first-platform-surface
 * Property 15: Agentic operation input validation
 *
 * For arbitrary invalid agent options — empty prompt (0 chars), oversized prompt
 * (>10,000 chars), empty skills list, skills list >50, or a skill reference not
 * present in the Generated_SDK_Artifact — `validateAgentOptions` throws a
 * `ValidationError` identifying the invalid input and does NOT invoke a model.
 *
 * **Validates: Requirements 4.2, 4.6**
 */

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** A set of available skill names that exist in the "generated artifact". */
const AVAILABLE_SKILLS = new Set(['orders-readonly', 'commerce-full', 'analytics-read', 'connectors-manage']);

/** Arbitrary valid prompt (1–10,000 characters). */
const validPromptArb = fc.integer({ min: 1, max: 10_000 }).map(len => 'p'.repeat(len));

/** Arbitrary valid skills array (1–50 entries, each referencing an available skill). */
const validSkillsArb = fc
  .integer({ min: 1, max: 50 })
  .chain(count =>
    fc.array(
      fc.constantFrom(...Array.from(AVAILABLE_SKILLS)).map(name => ({ name })),
      { minLength: count, maxLength: count }
    )
  );

/** Arbitrary empty prompt (exactly 0 chars). */
const emptyPromptArb = fc.constant('');

/** Arbitrary oversized prompt (>10,000 chars). */
const oversizedPromptArb = fc.integer({ min: 10_001, max: 20_000 }).map(len => 'x'.repeat(len));

/** Arbitrary empty skills list. */
const emptySkillsArb = fc.constant([] as SkillRef[]);

/** Arbitrary oversized skills list (>50 entries). */
const oversizedSkillsArb = fc
  .integer({ min: 51, max: 100 })
  .map(count =>
    Array.from({ length: count }, () => ({ name: 'orders-readonly' }))
  );

/** Arbitrary skill name NOT present in the available set. */
const invalidSkillNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter(name => !AVAILABLE_SKILLS.has(name));

/** Arbitrary skills list containing at least one invalid (not-in-artifact) reference. */
const invalidSkillRefArb = fc
  .tuple(
    fc.integer({ min: 0, max: 10 }),
    invalidSkillNameArb
  )
  .map(([validCount, badName]) => {
    const skills: SkillRef[] = Array.from(
      { length: validCount },
      () => ({ name: 'orders-readonly' })
    );
    skills.push({ name: badName });
    return skills;
  });

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: ai-first-platform-surface, Property 15: Agentic operation input validation', () => {
  it(
    'R4.2, R4.6: rejects empty prompt (0 chars) with a ValidationError identifying "prompt"',
    () => {
      fc.assert(
        fc.property(emptyPromptArb, validSkillsArb, (prompt, skills) => {
          try {
            validateAgentOptions({ prompt, skills }, AVAILABLE_SKILLS);
            return false; // should have thrown
          } catch (e) {
            if (!(e instanceof ValidationError)) return false;
            // Must identify the prompt field
            return e.field_errors.some(fe => fe.field === 'prompt');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.2, R4.6: rejects oversized prompt (>10,000 chars) with a ValidationError identifying "prompt"',
    () => {
      fc.assert(
        fc.property(oversizedPromptArb, validSkillsArb, (prompt, skills) => {
          try {
            validateAgentOptions({ prompt, skills }, AVAILABLE_SKILLS);
            return false;
          } catch (e) {
            if (!(e instanceof ValidationError)) return false;
            return e.field_errors.some(fe => fe.field === 'prompt');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.2, R4.6: rejects empty skills list with a ValidationError identifying "skills"',
    () => {
      fc.assert(
        fc.property(validPromptArb, emptySkillsArb, (prompt, skills) => {
          try {
            validateAgentOptions({ prompt, skills }, AVAILABLE_SKILLS);
            return false;
          } catch (e) {
            if (!(e instanceof ValidationError)) return false;
            return e.field_errors.some(fe => fe.field === 'skills');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.2, R4.6: rejects skills list >50 entries with a ValidationError identifying "skills"',
    () => {
      fc.assert(
        fc.property(validPromptArb, oversizedSkillsArb, (prompt, skills) => {
          try {
            validateAgentOptions({ prompt, skills }, AVAILABLE_SKILLS);
            return false;
          } catch (e) {
            if (!(e instanceof ValidationError)) return false;
            return e.field_errors.some(fe => fe.field === 'skills');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.2, R4.6: rejects invalid skill reference (not in Generated_SDK_Artifact) with a ValidationError identifying "skills"',
    () => {
      fc.assert(
        fc.property(validPromptArb, invalidSkillRefArb, (prompt, skills) => {
          try {
            validateAgentOptions({ prompt, skills }, AVAILABLE_SKILLS);
            return false;
          } catch (e) {
            if (!(e instanceof ValidationError)) return false;
            return e.field_errors.some(fe => fe.field === 'skills');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'R4.6: all rejections identify the invalid input (error message references the field)',
    () => {
      // Combine all invalid input categories into a single arbitrary
      const invalidOptionsArb: fc.Arbitrary<{ options: AgentOptions; expectedField: string }> = fc.oneof(
        // Empty prompt
        validSkillsArb.map(skills => ({
          options: { prompt: '', skills } as AgentOptions,
          expectedField: 'prompt',
        })),
        // Oversized prompt
        fc.tuple(oversizedPromptArb, validSkillsArb).map(([prompt, skills]) => ({
          options: { prompt, skills } as AgentOptions,
          expectedField: 'prompt',
        })),
        // Empty skills
        validPromptArb.map(prompt => ({
          options: { prompt, skills: [] } as AgentOptions,
          expectedField: 'skills',
        })),
        // Skills > 50
        fc.tuple(validPromptArb, oversizedSkillsArb).map(([prompt, skills]) => ({
          options: { prompt, skills } as AgentOptions,
          expectedField: 'skills',
        })),
        // Invalid skill ref
        fc.tuple(validPromptArb, invalidSkillRefArb).map(([prompt, skills]) => ({
          options: { prompt, skills } as AgentOptions,
          expectedField: 'skills',
        })),
      );

      fc.assert(
        fc.property(invalidOptionsArb, ({ options, expectedField }) => {
          try {
            validateAgentOptions(options, AVAILABLE_SKILLS);
            return false;
          } catch (e) {
            if (!(e instanceof ValidationError)) return false;
            // The error message must mention the expected field
            const identifiesField = e.field_errors.some(fe => fe.field === expectedField);
            // The message string must reference the field
            const messageReferences = e.message.includes(expectedField);
            return identifiesField && messageReferences;
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Positive: valid options (prompt 1–10,000, skills 1–50 all in artifact) do not throw',
    () => {
      fc.assert(
        fc.property(validPromptArb, validSkillsArb, (prompt, skills) => {
          // Should not throw
          validateAgentOptions({ prompt, skills }, AVAILABLE_SKILLS);
          return true;
        }),
        { numRuns: 100 },
      );
    },
  );
});
