/**
 * CLI: loxtep proposals list|accept|reject|infer-definitions
 *
 * SDK/MCP parity for semantic proposal review (`client.meaning.proposals` /
 * loxtep_meaning list/infer/accept/reject ops).
 */

import type { LoxtepClient } from '../../client/loxtep-client.js';
import type { CliResult } from '../project-context.js';

function okJson(data: unknown): CliResult {
  return { exitCode: 0, stdout: [JSON.stringify(data, null, 2)], stderr: [] };
}

function fail(message: string): CliResult {
  return { exitCode: 1, stdout: [], stderr: [message] };
}

export async function runProposalsListCommand(
  client: LoxtepClient,
  options?: {
    disposition?: string;
    proposal_type?: string;
    data_product_id?: string;
    page?: number;
    page_size?: number;
  }
): Promise<CliResult> {
  try {
    const result = await client.meaning.proposals.list({
      disposition: (options?.disposition as 'pending' | undefined) ?? 'pending',
      proposal_type: options?.proposal_type,
      data_product_id: options?.data_product_id,
      page: options?.page,
      page_size: options?.page_size,
    });
    return okJson(result);
  } catch (err: unknown) {
    return fail(
      `Failed to list semantic proposals: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function runProposalsAcceptCommand(
  client: LoxtepClient,
  semantic_proposal_id: string,
  options?: { definition?: string; resolution_note?: string }
): Promise<CliResult> {
  if (!semantic_proposal_id) {
    return fail('Usage: loxtep proposals accept <semantic_proposal_id> [--definition …]');
  }
  try {
    const result = await client.meaning.proposals.accept(semantic_proposal_id, {
      definition: options?.definition,
      resolution_note: options?.resolution_note,
    });
    return okJson(result);
  } catch (err: unknown) {
    return fail(
      `Failed to accept proposal: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function runProposalsRejectCommand(
  client: LoxtepClient,
  semantic_proposal_id: string,
  options?: { resolution_note?: string }
): Promise<CliResult> {
  if (!semantic_proposal_id) {
    return fail('Usage: loxtep proposals reject <semantic_proposal_id>');
  }
  try {
    const result = await client.meaning.proposals.reject(semantic_proposal_id, {
      resolution_note: options?.resolution_note,
    });
    return okJson(result);
  } catch (err: unknown) {
    return fail(
      `Failed to reject proposal: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function runProposalsInferDefinitionsCommand(
  client: LoxtepClient,
  semantic_proposal_ids: string[]
): Promise<CliResult> {
  if (!semantic_proposal_ids.length) {
    return fail(
      'Usage: loxtep proposals infer-definitions <id> [<id>…]  (max 20)'
    );
  }
  try {
    const result = await client.meaning.proposals.infer_definitions(semantic_proposal_ids);
    return okJson(result);
  } catch (err: unknown) {
    return fail(
      `Failed to infer definitions: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export const PROPOSALS_USAGE =
  'Usage: loxtep proposals list [--disposition pending] [--proposal-type vocabulary_term] [--data-product-id <uuid>]\n' +
  '       loxtep proposals accept <semantic_proposal_id> [--definition "…"] [--resolution-note "…"]\n' +
  '       loxtep proposals reject <semantic_proposal_id> [--resolution-note "…"]\n' +
  '       loxtep proposals infer-definitions <id> [<id>…]';
