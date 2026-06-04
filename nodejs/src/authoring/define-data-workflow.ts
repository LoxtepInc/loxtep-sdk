/**
 * `defineDataWorkflow` factory — the core code-first authoring entry point.
 *
 * Validates the module specification synchronously using zod and throws a
 * `ValidationError` naming the invalid argument on failure.
 */

import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import type { DataWorkflowModule } from './types.js';

/**
 * Zod schema for the `requireApproval` array.
 * Each entry is a non-empty string of 1–256 characters, with at most 100 entries.
 */
const requireApprovalSchema = z
  .array(z.string().min(1).max(256))
  .max(100)
  .optional();

/**
 * Validates a `DataWorkflowModule` specification and returns it unchanged.
 *
 * Throws `ValidationError` (from `@loxtep/sdk/errors`) with a `field_errors`
 * entry naming the invalid argument when validation fails.
 *
 * Validation rules:
 * - `name`: 1–64 characters (R3.1, R3.8)
 * - `triggers`: at least 1 and at most 10 entries (R3.1, R3.8)
 * - `requireApproval`: at most 100 entries, each 1–256 characters (R6.1)
 *
 * @param spec - The workflow module specification to validate.
 * @returns The validated specification (unchanged).
 * @throws {ValidationError} If any argument is invalid.
 */
export function defineDataWorkflow(spec: DataWorkflowModule): DataWorkflowModule {
  const errors: Array<{ field: string; message: string }> = [];

  // Validate name (1–64 characters)
  if (typeof spec.name !== 'string' || spec.name.length < 1 || spec.name.length > 64) {
    errors.push({
      field: 'name',
      message: `name must be between 1 and 64 characters, got ${typeof spec.name === 'string' ? spec.name.length : typeof spec.name}`,
    });
  }

  // Validate triggers (1–10)
  if (!Array.isArray(spec.triggers) || spec.triggers.length < 1 || spec.triggers.length > 10) {
    const count = Array.isArray(spec.triggers) ? spec.triggers.length : 0;
    errors.push({
      field: 'triggers',
      message: `triggers must contain between 1 and 10 entries, got ${count}`,
    });
  }

  // Validate requireApproval (≤100 entries, each 1–256 chars)
  if (spec.requireApproval !== undefined) {
    const result = requireApprovalSchema.safeParse(spec.requireApproval);
    if (!result.success) {
      const zodIssues = result.error.issues;
      // Provide a targeted message based on the zod failure
      const issue = zodIssues[0];
      if (issue) {
        if (issue.code === 'too_big' && issue.path.length === 0) {
          errors.push({
            field: 'requireApproval',
            message: `requireApproval must contain at most 100 entries, got ${(spec.requireApproval as string[]).length}`,
          });
        } else if (issue.code === 'too_small' && issue.path.length > 0) {
          const idx = String(issue.path[0]);
          errors.push({
            field: 'requireApproval',
            message: `requireApproval[${idx}] must be between 1 and 256 characters`,
          });
        } else if (issue.code === 'too_big' && issue.path.length > 0) {
          const idx = issue.path[0];
          const idxStr = String(idx);
          errors.push({
            field: 'requireApproval',
            message: `requireApproval[${idxStr}] must be between 1 and 256 characters, got ${(spec.requireApproval as string[])[idx as number]?.length}`,
          });
        } else {
          errors.push({
            field: 'requireApproval',
            message: `requireApproval is invalid: ${issue.message}`,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    const message = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new ValidationError(
      `Invalid defineDataWorkflow specification: ${message}`,
      errors,
    );
  }

  return spec;
}
