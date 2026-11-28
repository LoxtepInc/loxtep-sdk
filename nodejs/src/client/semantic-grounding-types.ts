/** Shared wire contracts for semantic grounding. Validation is not authorization. */
import { z } from 'zod';

const Id = z.string().trim().min(1);
const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const Timestamp = z.string().datetime({ offset: true });

export const SemanticReferenceSchema = z
  .object({
    kind: z.enum(['concept', 'term', 'binding', 'metric', 'relationship', 'data_product']),
    id: Id,
    version: z.number().int().positive().nullable(),
    fingerprint: Fingerprint,
    source_ref: Id,
  })
  .strict();

export const RelationshipReviewRecordSchema = z
  .object({
    review_id: Id,
    revision: z.number().int().positive(),
    organization_id: z.string().uuid(),
    left_product_id: Id,
    right_product_id: Id,
    left_shape_id: Id,
    right_shape_id: Id,
    field_pairs: z.array(z.object({ left_field: Id, right_field: Id }).strict()).min(1),
    role: Id,
    direction: z.enum(['left_to_right', 'right_to_left', 'bidirectional']),
    cardinality: z.enum(['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many']),
    left_schema_fingerprint: Fingerprint,
    right_schema_fingerprint: Fingerprint,
    binding_fingerprint: Fingerprint,
    evidence_fingerprint: Fingerprint,
    evidence_refs: z.array(Id).min(1),
    reviewer_user_id: z.string().uuid(),
    decision: z.enum(['approved', 'rejected']),
    reason: Id,
    reviewed_at: Timestamp,
  })
  .strict()
  .superRefine((record, ctx) => {
    for (const side of ['left_field', 'right_field'] as const) {
      const fields = record.field_pairs.map(pair => pair[side]);
      if (new Set(fields).size !== fields.length) {
        ctx.addIssue({ code: 'custom', path: ['field_pairs'], message: `Duplicate ${side}` });
      }
    }
  });

export const GroundingBlockerCodeSchema = z.enum([
  'missing_meaning',
  'ambiguous_alias',
  'ambiguous_relationship_role',
  'unreviewed_relationship',
  'stale_relationship',
  'stale_binding',
  'metric_unavailable',
  'metric_not_servable',
  'forbidden_scope',
  'unsupported_query_shape',
  'aggregation_fanout',
  'infrastructure_unavailable',
  'insufficient_evidence',
  'legacy_confirmation',
  'incomplete_composite_key',
]);

const Blocker = z
  .object({
    code: GroundingBlockerCodeSchema,
    message: Id,
    // Only references the actor is authorized to discover may be included.
    references: z.array(SemanticReferenceSchema),
  })
  .strict();
const Choice = z
  .object({ id: Id, label: Id, references: z.array(SemanticReferenceSchema) })
  .strict();
const NextAction = z
  .object({
    action: z.enum([
      'clarify',
      'review_meaning',
      'reconfirm_relationship',
      'retry',
      'request_access',
    ]),
    label: Id,
    target_ref: Id.optional(),
  })
  .strict();
const AnswerabilityBase = {
  evaluated_at: Timestamp,
  references: z.array(SemanticReferenceSchema),
  next_actions: z.array(NextAction),
};

export const SemanticGroundingAnswerabilitySchema = z.discriminatedUnion('status', [
  z
    .object({
      ...AnswerabilityBase,
      status: z.literal('ready'),
      blockers: z.array(Blocker).max(0),
      clarification_choices: z.array(Choice).max(0),
    })
    .strict(),
  z
    .object({
      ...AnswerabilityBase,
      status: z.literal('needs_clarification'),
      blockers: z.array(Blocker).min(1),
      clarification_choices: z.array(Choice).min(2),
    })
    .strict(),
  z
    .object({
      ...AnswerabilityBase,
      status: z.literal('blocked'),
      blockers: z.array(Blocker).min(1),
      clarification_choices: z.array(Choice).max(0),
    })
    .strict(),
  z
    .object({
      ...AnswerabilityBase,
      status: z.literal('unverified'),
      blockers: z.array(Blocker).min(1),
      clarification_choices: z.array(Choice).max(0),
    })
    .strict(),
]);

export const GroundingReceiptSchema = z
  .object({
    receipt_id: Id,
    organization_id: z.string().uuid(),
    actor_id: Id,
    query_fingerprint: Fingerprint,
    context_fingerprint: Fingerprint,
    references: z.array(SemanticReferenceSchema).min(1),
    relationship_review_ids: z.array(Id),
    authorized_at: Timestamp,
    validated_at: Timestamp,
  })
  .strict();

export const GroundedQueryOutcomeSchema = z.enum([
  'success',
  'empty_success',
  'partial',
  'cancelled',
  'blocked',
  'unavailable',
]);

export type SemanticReference = z.infer<typeof SemanticReferenceSchema>;
export type RelationshipReviewRecord = z.infer<typeof RelationshipReviewRecordSchema>;
export type SemanticGroundingAnswerability = z.infer<typeof SemanticGroundingAnswerabilitySchema>;
export type GroundingReceipt = z.infer<typeof GroundingReceiptSchema>;
export type GroundedQueryOutcome = z.infer<typeof GroundedQueryOutcomeSchema>;
