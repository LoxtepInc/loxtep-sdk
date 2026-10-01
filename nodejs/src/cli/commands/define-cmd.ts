/**
 * CLI: loxtep define …
 *
 * Mirrors MCP `loxtep_define` product-definition ops + thin REST status/actions.
 *
 *   loxtep define status <data_product_id>
 *   loxtep define evidence <data_product_id>
 *   loxtep define list [--data-product-id <id>] [--disposition <val>] [--proposal-type product_shape|product_semantic_bindings]
 *   loxtep define get <semantic_proposal_id>
 *   loxtep define submit-shape <data_product_id> --definition <json> [--rationale …] [--base-revision …] [--evidence-refs <csv>]
 *   loxtep define submit-semantic <data_product_id> [--definition <json>] [--rationale …]
 *   loxtep define approve|apply|withdraw <semantic_proposal_id>
 *   loxtep define skill
 *   loxtep define start-procedure <data_product_id>
 *   loxtep define batch --data-product-ids <id,id> [--action status|evidence]
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { CliResult } from '../project-context.js';
import type {
  DefinitionBatchAction,
  DefinitionProposalType,
  ListDefinitionProposalsFilters,
} from '../../client/product-definition-types.js';

function okJson(value: unknown): CliResult {
  return { exitCode: 0, stdout: [JSON.stringify(value, null, 2)], stderr: [] };
}

function fail(message: string): CliResult {
  return { exitCode: 1, stdout: [], stderr: [message] };
}

function parseJsonObject(
  raw: string | undefined,
  flag: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (raw == null || raw === '') {
    return { ok: false, error: `${flag} is required and must be a JSON object.` };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: `Invalid ${flag}: must be a JSON object.` };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: `Invalid ${flag}: must be valid JSON.` };
  }
}

export async function runDefineStatusCommand(
  client: LoxtepClient,
  data_product_id: string
): Promise<CliResult> {
  if (!data_product_id) {
    return fail('data_product_id is required. Usage: loxtep define status <data_product_id>');
  }
  try {
    return okJson(await client.define.product_definition.get_definition_status(data_product_id));
  } catch (err: unknown) {
    return fail(`Failed to get definition status: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runDefineEvidenceCommand(
  client: LoxtepClient,
  data_product_id: string
): Promise<CliResult> {
  if (!data_product_id) {
    return fail('data_product_id is required. Usage: loxtep define evidence <data_product_id>');
  }
  try {
    return okJson(
      await client.define.product_definition.get_definition_evidence(data_product_id)
    );
  } catch (err: unknown) {
    return fail(
      `Failed to gather definition evidence: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export interface DefineListOptions {
  data_product_id?: string;
  disposition?: string;
  proposal_type?: string;
}

export async function runDefineListCommand(
  client: LoxtepClient,
  options?: DefineListOptions
): Promise<CliResult> {
  const filters: ListDefinitionProposalsFilters = {};
  if (options?.data_product_id) filters.data_product_id = options.data_product_id;
  if (options?.disposition) filters.disposition = options.disposition;
  if (options?.proposal_type) {
    const t = options.proposal_type;
    if (t !== 'product_shape' && t !== 'product_semantic_bindings') {
      return fail(
        `Invalid --proposal-type: '${t}'. Must be product_shape or product_semantic_bindings.`
      );
    }
    filters.proposal_type = t as DefinitionProposalType;
  }
  try {
    return okJson(await client.define.product_definition.list_definition_proposals(filters));
  } catch (err: unknown) {
    return fail(
      `Failed to list definition proposals: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function runDefineGetCommand(
  client: LoxtepClient,
  semantic_proposal_id: string
): Promise<CliResult> {
  if (!semantic_proposal_id) {
    return fail('semantic_proposal_id is required. Usage: loxtep define get <semantic_proposal_id>');
  }
  try {
    return okJson(
      await client.define.product_definition.get_definition_proposal(semantic_proposal_id)
    );
  } catch (err: unknown) {
    return fail(
      `Failed to get definition proposal: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export interface DefineSubmitShapeOptions {
  definition_json?: string;
  rationale?: string;
  base_revision?: string;
  evidence_refs?: string;
}

export async function runDefineSubmitShapeCommand(
  client: LoxtepClient,
  data_product_id: string,
  options?: DefineSubmitShapeOptions
): Promise<CliResult> {
  if (!data_product_id) {
    return fail(
      'data_product_id is required. Usage: loxtep define submit-shape <data_product_id> --definition <json>'
    );
  }
  const def = parseJsonObject(options?.definition_json, '--definition');
  if (!def.ok) return fail(def.error);
  try {
    const evidence_refs = options?.evidence_refs
      ? options.evidence_refs
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return okJson(
      await client.define.product_definition.submit_shape_proposal({
        data_product_id,
        proposed_definition: def.value,
        rationale: options?.rationale,
        base_definition_revision: options?.base_revision,
        evidence_refs,
      })
    );
  } catch (err: unknown) {
    return fail(
      `Failed to submit shape proposal: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export interface DefineSubmitSemanticOptions {
  definition_json?: string;
  rationale?: string;
}

export async function runDefineSubmitSemanticCommand(
  client: LoxtepClient,
  data_product_id: string,
  options?: DefineSubmitSemanticOptions
): Promise<CliResult> {
  if (!data_product_id) {
    return fail(
      'data_product_id is required. Usage: loxtep define submit-semantic <data_product_id> [--definition <json>]'
    );
  }
  let body: Record<string, unknown> = {};
  if (options?.definition_json) {
    const def = parseJsonObject(options.definition_json, '--definition');
    if (!def.ok) return fail(def.error);
    body = def.value;
  }
  try {
    return okJson(
      await client.define.product_definition.submit_semantic_bindings_proposal({
        data_product_id,
        rationale: options?.rationale,
        canonical_targets: Array.isArray(body.canonical_targets)
          ? (body.canonical_targets as unknown[])
          : [],
        field_mappings: Array.isArray(body.field_mappings)
          ? (body.field_mappings as unknown[])
          : [],
        concept_alignments: Array.isArray(body.concept_alignments)
          ? (body.concept_alignments as unknown[])
          : [],
        relationship_types: Array.isArray(body.relationship_types)
          ? (body.relationship_types as unknown[])
          : [],
        unresolved_gaps: Array.isArray(body.unresolved_gaps)
          ? (body.unresolved_gaps as unknown[])
          : undefined,
        evidence_refs: Array.isArray(body.evidence_refs)
          ? (body.evidence_refs as string[])
          : undefined,
        base_definition_revision:
          typeof body.base_definition_revision === 'string'
            ? body.base_definition_revision
            : undefined,
      })
    );
  } catch (err: unknown) {
    return fail(
      `Failed to submit semantic bindings proposal: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

export async function runDefineApproveCommand(
  client: LoxtepClient,
  semantic_proposal_id: string
): Promise<CliResult> {
  if (!semantic_proposal_id) {
    return fail(
      'semantic_proposal_id is required. Usage: loxtep define approve <semantic_proposal_id>'
    );
  }
  try {
    return okJson(
      await client.define.product_definition.approve_definition_proposal(semantic_proposal_id)
    );
  } catch (err: unknown) {
    return fail(
      `Failed to approve definition proposal: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function runDefineApplyCommand(
  client: LoxtepClient,
  semantic_proposal_id: string
): Promise<CliResult> {
  if (!semantic_proposal_id) {
    return fail(
      'semantic_proposal_id is required. Usage: loxtep define apply <semantic_proposal_id>'
    );
  }
  try {
    return okJson(
      await client.define.product_definition.apply_definition_proposal(semantic_proposal_id)
    );
  } catch (err: unknown) {
    return fail(
      `Failed to apply definition proposal: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function runDefineWithdrawCommand(
  client: LoxtepClient,
  semantic_proposal_id: string
): Promise<CliResult> {
  if (!semantic_proposal_id) {
    return fail(
      'semantic_proposal_id is required. Usage: loxtep define withdraw <semantic_proposal_id>'
    );
  }
  try {
    return okJson(
      await client.define.product_definition.withdraw_definition_proposal(semantic_proposal_id)
    );
  } catch (err: unknown) {
    return fail(
      `Failed to withdraw definition proposal: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function runDefineSkillCommand(client: LoxtepClient): Promise<CliResult> {
  try {
    return okJson(await client.define.product_definition.get_definition_skill());
  } catch (err: unknown) {
    return fail(
      `Failed to load definition skill: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function runDefineStartProcedureCommand(
  client: LoxtepClient,
  data_product_id: string
): Promise<CliResult> {
  if (!data_product_id) {
    return fail(
      'data_product_id is required. Usage: loxtep define start-procedure <data_product_id>'
    );
  }
  try {
    return okJson(
      await client.define.product_definition.start_definition_procedure_run(data_product_id)
    );
  } catch (err: unknown) {
    return fail(
      `Failed to start definition procedure: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export interface DefineBatchOptions {
  data_product_ids?: string;
  action?: string;
}

export async function runDefineBatchCommand(
  client: LoxtepClient,
  options?: DefineBatchOptions
): Promise<CliResult> {
  const raw = options?.data_product_ids ?? '';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return fail(
      '--data-product-ids is required. Usage: loxtep define batch --data-product-ids <id,id> [--action status|evidence]'
    );
  }
  const action = options?.action ?? 'status';
  if (action !== 'status' && action !== 'evidence') {
    return fail(`Invalid --action: '${action}'. Must be status or evidence.`);
  }
  try {
    return okJson(
      await client.define.product_definition.run_definition_batch({
        data_product_ids: ids,
        action: action as DefinitionBatchAction,
      })
    );
  } catch (err: unknown) {
    return fail(
      `Failed to run definition batch: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export const DEFINE_USAGE =
  'Usage: loxtep define status <data_product_id>\n' +
  '       loxtep define evidence <data_product_id>\n' +
  '       loxtep define list [--data-product-id <id>] [--disposition <val>] [--proposal-type product_shape|product_semantic_bindings]\n' +
  '       loxtep define get <semantic_proposal_id>\n' +
  '       loxtep define submit-shape <data_product_id> --definition <json> [--rationale <text>] [--base-revision <rev>] [--evidence-refs <csv>]\n' +
  '       loxtep define submit-semantic <data_product_id> [--definition <json>] [--rationale <text>]\n' +
  '       loxtep define approve|apply|withdraw <semantic_proposal_id>\n' +
  '       loxtep define skill\n' +
  '       loxtep define start-procedure <data_product_id>\n' +
  '       loxtep define batch --data-product-ids <id,id> [--action status|evidence]';
