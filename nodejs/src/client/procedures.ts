/**
 * Procedures API (LOX-1249). CRUD + import/export vs MCP loxtep_context.
 *
 *   GET    /graph/organizations/{org}/procedures
 *   GET    /graph/procedures/{procedure_id}
 *   POST   /graph/organizations/{org}/procedures
 *   PUT    /graph/procedures/{procedure_id}
 *   DELETE /graph/procedures/{procedure_id}
 *   POST   /graph/organizations/{org}/procedures/import
 *   GET    /graph/procedures/{procedure_id}/export
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type {
  ExportProcessGraphInput,
  ImportProcessGraphInput,
  Procedure,
  ProcedureCreateInput,
  ProcedureDeleteResult,
  ProcedureUpdateInput,
  ProceduresApiDeps,
  ProceduresListFilters,
  ProceduresListResult,
} from './procedures-types.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

function requireOrg(deps: ProceduresApiDeps, override?: string): string {
  const org = override ?? deps.organization_id;
  if (!org) {
    throw new Error(
      'organization_id is required for procedures calls (set it on the client or pass it explicitly)'
    );
  }
  return org;
}

function orgProceduresPath(org: string): string {
  return `/graph/organizations/${encodeURIComponent(org)}/procedures`;
}

function procedurePath(procedure_id: string): string {
  return `/graph/procedures/${encodeURIComponent(procedure_id)}`;
}

function buildListQuery(filters: ProceduresListFilters): string {
  const search = new URLSearchParams();
  if (filters.status) search.set('status', filters.status);
  if (filters.name) search.set('name', filters.name);
  if (filters.has_step_with_agent) search.set('has_step_with_agent', filters.has_step_with_agent);
  if (filters.has_trigger_type) search.set('has_trigger_type', filters.has_trigger_type);
  if (filters.domain_id) search.set('domain_id', filters.domain_id);
  if (filters.has_dependents !== undefined) {
    search.set('has_dependents', String(filters.has_dependents));
  }
  if (filters.depends_on) search.set('depends_on', filters.depends_on);
  if (filters.created_after) search.set('created_after', filters.created_after);
  if (filters.created_before) search.set('created_before', filters.created_before);
  if (filters.include_platform !== undefined) {
    search.set('include_platform', String(filters.include_platform));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function normalizeListResult(data: unknown): ProceduresListResult {
  if (Array.isArray(data)) {
    return { procedures: data as Procedure[], total: data.length };
  }
  const obj = (data ?? {}) as {
    procedures?: Procedure[];
    items?: Procedure[];
    total?: number;
  };
  const procedures = obj.procedures ?? obj.items ?? [];
  return {
    procedures,
    total: obj.total ?? procedures.length,
  };
}

function omitUndefined(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export type ProceduresApi = {
  list: (filters?: ProceduresListFilters) => Promise<ProceduresListResult>;
  /** MCP op name alias for list. */
  list_procedures: (filters?: ProceduresListFilters) => Promise<ProceduresListResult>;
  get: (procedure_id: string, organization_id?: string) => Promise<Procedure>;
  get_procedure: (procedure_id: string, organization_id?: string) => Promise<Procedure>;
  create: (input: ProcedureCreateInput) => Promise<Procedure | Record<string, unknown>>;
  create_procedure: (input: ProcedureCreateInput) => Promise<Procedure | Record<string, unknown>>;
  update: (
    procedure_id: string,
    input: ProcedureUpdateInput
  ) => Promise<Procedure | Record<string, unknown>>;
  update_procedure: (
    procedure_id: string,
    input: ProcedureUpdateInput
  ) => Promise<Procedure | Record<string, unknown>>;
  delete: (procedure_id: string, organization_id?: string) => Promise<ProcedureDeleteResult>;
  delete_procedure: (
    procedure_id: string,
    organization_id?: string
  ) => Promise<ProcedureDeleteResult>;
  import_process_graph: (
    input: ImportProcessGraphInput
  ) => Promise<Procedure | Record<string, unknown>>;
  export_process_graph: (input: ExportProcessGraphInput) => Promise<unknown>;
};

/**
 * Create the procedures API surface (graph CRUD + import/export).
 */
export function createProceduresApi(
  http: LoxtepHttpClient,
  deps: ProceduresApiDeps = {}
): ProceduresApi {
  async function list(filters: ProceduresListFilters = {}): Promise<ProceduresListResult> {
    const org = requireOrg(deps, filters.organization_id);
    const res = await http.get(`${orgProceduresPath(org)}${buildListQuery(filters)}`);
    return normalizeListResult(unwrapData(res));
  }

  async function get(procedure_id: string, _organization_id?: string): Promise<Procedure> {
    if (!procedure_id) throw new Error('procedure_id is required');
    // Path is /graph/procedures/:id — organization_id is MCP routing context only.
    const res = await http.get(procedurePath(procedure_id));
    return unwrapData<Procedure>(res);
  }

  async function create(
    input: ProcedureCreateInput
  ): Promise<Procedure | Record<string, unknown>> {
    if (!input?.name) throw new Error('name is required');
    const org = requireOrg(deps, input.organization_id);
    const {
      organization_id: _org,
      name,
      description,
      status,
      domain_id,
      version,
      owner,
      steps,
      decisions,
      triggers,
      dependencies,
      metadata,
      lifecycle_state,
      change_propagation_policy,
    } = input;
    const body = omitUndefined({
      name,
      description,
      status,
      domain_id,
      version,
      owner,
      steps,
      decisions,
      triggers,
      dependencies,
      metadata,
      lifecycle_state,
      change_propagation_policy,
    });
    const res = await http.post(orgProceduresPath(org), body);
    return unwrapData(res);
  }

  async function update(
    procedure_id: string,
    input: ProcedureUpdateInput
  ): Promise<Procedure | Record<string, unknown>> {
    if (!procedure_id) throw new Error('procedure_id is required');
    const {
      organization_id: _org,
      name,
      description,
      status,
      domain_id,
      version,
      owner,
      steps,
      decisions,
      triggers,
      dependencies,
      metadata,
      lifecycle_state,
      change_propagation_policy,
    } = input;
    const body = omitUndefined({
      name,
      description,
      status,
      domain_id,
      version,
      owner,
      steps,
      decisions,
      triggers,
      dependencies,
      metadata,
      lifecycle_state,
      change_propagation_policy,
    });
    if (Object.keys(body).length === 0) {
      throw new Error('At least one field must be provided for update');
    }
    const res = await http.put(procedurePath(procedure_id), body);
    return unwrapData(res);
  }

  async function deleteProcedure(
    procedure_id: string,
    _organization_id?: string
  ): Promise<ProcedureDeleteResult> {
    if (!procedure_id) throw new Error('procedure_id is required');
    const res = await http.delete(procedurePath(procedure_id));
    const envelope = res as {
      data?: Procedure | Record<string, unknown>;
      warnings?: string[];
    };
    return {
      procedure: unwrapData(res),
      warnings: envelope.warnings,
      raw: res,
    };
  }

  async function importProcessGraph(
    input: ImportProcessGraphInput
  ): Promise<Procedure | Record<string, unknown>> {
    const org = requireOrg(deps, input.organization_id);
    if (input.graph == null && input.s3_reference == null) {
      throw new Error('Either graph (inline JSON-LD) or s3_reference must be provided');
    }
    if (input.graph != null && input.s3_reference != null) {
      throw new Error('Cannot provide both graph and s3_reference — choose one');
    }
    const body = omitUndefined({
      graph: input.graph,
      s3_reference: input.s3_reference,
      procedure_id: input.procedure_id,
      domain_id: input.domain_id,
      skip_catalog: input.skip_catalog,
      options: input.options,
    });
    const res = await http.post(`${orgProceduresPath(org)}/import`, body);
    return unwrapData(res);
  }

  async function exportProcessGraph(input: ExportProcessGraphInput): Promise<unknown> {
    if (!input?.procedure_id) throw new Error('procedure_id is required');
    const format = input.format ?? 'jsonld';
    const qs = new URLSearchParams({ format });
    if (input.preserve_namespaces) qs.set('preserve_namespaces', 'true');
    const res = await http.get(`${procedurePath(input.procedure_id)}/export?${qs.toString()}`);
    return unwrapData(res);
  }

  return {
    list,
    list_procedures: list,
    get,
    get_procedure: get,
    create,
    create_procedure: create,
    update,
    update_procedure: update,
    delete: deleteProcedure,
    delete_procedure: deleteProcedure,
    import_process_graph: importProcessGraph,
    export_process_graph: exportProcessGraph,
  };
}
