/**
 * Product definition API (MCP: loxtep_define definition ops).
 *
 * Prefer thin REST where it exists:
 *   GET  /semantic-layer/product-definition?data_product_id=
 *   POST /semantic-layer/product-definition { action, semantic_proposal_id }
 *
 * Remaining ops call POST /ai/mcp/tools/call with facade name `loxtep_define`
 * and `operation` (submit/revise/list/evidence/skill/batch/start_procedure).
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  ListDefinitionProposalsFilters,
  ProductDefinitionAction,
  ReviseDefinitionProposalInput,
  RunDefinitionBatchInput,
  SubmitSemanticBindingsInput,
  SubmitShapeProposalInput,
} from './product-definition-types.js';

const REST_BASE = '/semantic-layer/product-definition';
const MCP_TOOLS_PATH = '/ai/mcp/tools/call';

type McpToolCallResponse = {
  data?: {
    content?: Array<{ type?: string; text?: string }>;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function parseToolResponse(res: McpToolCallResponse): unknown {
  const first = res?.data?.content?.[0];
  if (first?.type === 'text' && typeof first.text === 'string') {
    try {
      return JSON.parse(first.text) as unknown;
    } catch {
      return { raw: first.text };
    }
  }
  return res;
}

/** CustomerTool success envelope → payload. */
function unwrapToolPayload<T>(parsed: unknown): T {
  const rec = asRecord(parsed);
  if (rec && rec.success === false) {
    const err = typeof rec.error === 'string' ? rec.error : 'Definition operation failed';
    throw new Error(err);
  }
  if (rec && 'data' in rec) {
    return rec.data as T;
  }
  return parsed as T;
}

async function callDefineOp<T>(
  http: LoxtepHttpClient,
  operation: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const res = await http.post<McpToolCallResponse>(MCP_TOOLS_PATH, {
    name: 'loxtep_define',
    arguments: { operation, ...args },
  });
  return unwrapToolPayload<T>(parseToolResponse(res));
}

async function postAction(
  http: LoxtepHttpClient,
  action: ProductDefinitionAction,
  semantic_proposal_id: string
): Promise<unknown> {
  if (!semantic_proposal_id) throw new Error('semantic_proposal_id is required');
  const res = await http.post(REST_BASE, { action, semantic_proposal_id });
  return unwrapData(res);
}

export function createProductDefinitionApi(http: LoxtepHttpClient): {
  get_definition_evidence: (data_product_id: string) => Promise<unknown>;
  submit_shape_proposal: (input: SubmitShapeProposalInput) => Promise<unknown>;
  revise_shape_proposal: (input: ReviseDefinitionProposalInput) => Promise<unknown>;
  revise_semantic_bindings_proposal: (input: ReviseDefinitionProposalInput) => Promise<unknown>;
  get_definition_proposal: (semantic_proposal_id: string) => Promise<unknown>;
  list_definition_proposals: (filters?: ListDefinitionProposalsFilters) => Promise<unknown>;
  withdraw_definition_proposal: (semantic_proposal_id: string) => Promise<unknown>;
  submit_semantic_bindings_proposal: (input: SubmitSemanticBindingsInput) => Promise<unknown>;
  approve_definition_proposal: (semantic_proposal_id: string) => Promise<unknown>;
  apply_definition_proposal: (semantic_proposal_id: string) => Promise<unknown>;
  get_definition_status: (data_product_id: string) => Promise<unknown>;
  run_definition_batch: (input: RunDefinitionBatchInput) => Promise<unknown>;
  get_definition_skill: () => Promise<unknown>;
  start_definition_procedure_run: (data_product_id: string) => Promise<unknown>;
} {
  return {
    async get_definition_evidence(data_product_id: string): Promise<unknown> {
      if (!data_product_id) throw new Error('data_product_id is required');
      return callDefineOp(http, 'get_definition_evidence', { data_product_id });
    },

    async submit_shape_proposal(input: SubmitShapeProposalInput): Promise<unknown> {
      if (!input?.data_product_id) throw new Error('data_product_id is required');
      if (!input.proposed_definition) throw new Error('proposed_definition is required');
      return callDefineOp(http, 'submit_shape_proposal', { ...input });
    },

    async revise_shape_proposal(input: ReviseDefinitionProposalInput): Promise<unknown> {
      if (!input?.semantic_proposal_id) throw new Error('semantic_proposal_id is required');
      return callDefineOp(http, 'revise_shape_proposal', { ...input });
    },

    async revise_semantic_bindings_proposal(
      input: ReviseDefinitionProposalInput
    ): Promise<unknown> {
      if (!input?.semantic_proposal_id) throw new Error('semantic_proposal_id is required');
      return callDefineOp(http, 'revise_semantic_bindings_proposal', { ...input });
    },

    async get_definition_proposal(semantic_proposal_id: string): Promise<unknown> {
      if (!semantic_proposal_id) throw new Error('semantic_proposal_id is required');
      return callDefineOp(http, 'get_definition_proposal', { semantic_proposal_id });
    },

    async list_definition_proposals(
      filters: ListDefinitionProposalsFilters = {}
    ): Promise<unknown> {
      const args: Record<string, unknown> = {};
      if (filters.data_product_id) args.data_product_id = filters.data_product_id;
      if (filters.proposal_type) args.proposal_type = filters.proposal_type;
      if (filters.disposition) args.disposition = filters.disposition;
      return callDefineOp(http, 'list_definition_proposals', args);
    },

    async withdraw_definition_proposal(semantic_proposal_id: string): Promise<unknown> {
      return postAction(http, 'withdraw', semantic_proposal_id);
    },

    async submit_semantic_bindings_proposal(
      input: SubmitSemanticBindingsInput
    ): Promise<unknown> {
      if (!input?.data_product_id) throw new Error('data_product_id is required');
      return callDefineOp(http, 'submit_semantic_bindings_proposal', { ...input });
    },

    async approve_definition_proposal(semantic_proposal_id: string): Promise<unknown> {
      return postAction(http, 'approve', semantic_proposal_id);
    },

    async apply_definition_proposal(semantic_proposal_id: string): Promise<unknown> {
      return postAction(http, 'apply', semantic_proposal_id);
    },

    async get_definition_status(data_product_id: string): Promise<unknown> {
      if (!data_product_id) throw new Error('data_product_id is required');
      const qs = new URLSearchParams({ data_product_id });
      const res = await http.get(`${REST_BASE}?${qs.toString()}`);
      return unwrapData(res);
    },

    async run_definition_batch(input: RunDefinitionBatchInput): Promise<unknown> {
      const ids = input?.data_product_ids ?? [];
      if (ids.length === 0) throw new Error('data_product_ids is required');
      return callDefineOp(http, 'run_definition_batch', {
        data_product_ids: ids,
        action: input.action ?? 'status',
      });
    },

    async get_definition_skill(): Promise<unknown> {
      return callDefineOp(http, 'get_definition_skill', {});
    },

    async start_definition_procedure_run(data_product_id: string): Promise<unknown> {
      if (!data_product_id) throw new Error('data_product_id is required');
      return callDefineOp(http, 'start_definition_procedure_run', { data_product_id });
    },
  };
}

export type ProductDefinitionApi = ReturnType<typeof createProductDefinitionApi>;
