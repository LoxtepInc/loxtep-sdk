import { createProceduresApi } from './procedures.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createProceduresApi LOX-1249', () => {
  const procedure = {
    procedure_id: 'proc-1',
    name: 'Onboard customer',
    description: 'Happy path',
    status: 'draft' as const,
  };

  it('list / list_procedures GET .../organizations/:org/procedures with filters', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: { procedures: [procedure], total: 1 } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProceduresApi(http, { organization_id: 'org1' });
    const result = await api.list({
      status: 'draft',
      domain_id: 'domain-1',
      has_dependents: true,
    });

    expect(capturedPath).toBe(
      '/graph/organizations/org1/procedures?status=draft&domain_id=domain-1&has_dependents=true'
    );
    expect(result.procedures).toEqual([procedure]);
    expect(result.total).toBe(1);

    capturedPath = null;
    await api.list_procedures({ name: 'Onboard' });
    expect(capturedPath).toBe('/graph/organizations/org1/procedures?name=Onboard');
  });

  it('get / get_procedure GET /graph/procedures/:id', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: procedure };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProceduresApi(http);
    const result = await api.get('proc-1');
    expect(capturedPath).toBe('/graph/procedures/proc-1');
    expect(result).toEqual(procedure);

    capturedPath = null;
    await api.get_procedure('proc-2');
    expect(capturedPath).toBe('/graph/procedures/proc-2');
  });

  it('create / create_procedure POST body without organization_id', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: procedure };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProceduresApi(http, { organization_id: 'org1' });
    const result = await api.create({
      name: 'Onboard customer',
      description: 'Happy path',
      status: 'draft',
      steps: [{ name: 'Collect KYC', order: 0 }],
    });

    expect(capturedPath).toBe('/graph/organizations/org1/procedures');
    expect(capturedBody).toEqual({
      name: 'Onboard customer',
      description: 'Happy path',
      status: 'draft',
      steps: [{ name: 'Collect KYC', order: 0 }],
    });
    expect(result).toEqual(procedure);
  });

  it('update / update_procedure PUT only defined fields', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      put: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: { ...procedure, description: 'updated' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProceduresApi(http);
    await api.update('proc-1', { description: 'updated' });
    expect(capturedPath).toBe('/graph/procedures/proc-1');
    expect(capturedBody).toEqual({ description: 'updated' });
  });

  it('delete / delete_procedure DELETE and surfaces warnings', async () => {
    let capturedPath: string | null = null;
    const http = {
      delete: async (path: string) => {
        capturedPath = path;
        return {
          success: true as const,
          data: procedure,
          warnings: ['downstream dependents'],
        };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProceduresApi(http);
    const result = await api.delete_procedure('proc-1');
    expect(capturedPath).toBe('/graph/procedures/proc-1');
    expect(result.procedure).toEqual(procedure);
    expect(result.warnings).toEqual(['downstream dependents']);
  });

  it('import_process_graph POST .../procedures/import with graph', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: procedure };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProceduresApi(http, { organization_id: 'org1' });
    const graph = { '@context': {}, '@graph': [] };
    await api.import_process_graph({ graph, skip_catalog: true });

    expect(capturedPath).toBe('/graph/organizations/org1/procedures/import');
    expect(capturedBody).toEqual({ graph, skip_catalog: true });
  });

  it('import_process_graph rejects missing graph/s3 and both together', async () => {
    const http = {} as unknown as LoxtepHttpClient;
    const api = createProceduresApi(http, { organization_id: 'org1' });
    await expect(api.import_process_graph({})).rejects.toThrow(/graph|s3_reference/);
    await expect(
      api.import_process_graph({
        graph: '{}',
        s3_reference: { s3_bucket: 'b', s3_key: 'k' },
      })
    ).rejects.toThrow(/both/);
  });

  it('export_process_graph GET .../export?format=', async () => {
    let capturedPath: string | null = null;
    const payload = { '@context': {}, '@type': 'Procedure' };
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: payload };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProceduresApi(http);
    const result = await api.export_process_graph({
      procedure_id: 'proc-1',
      format: 'yaml',
      preserve_namespaces: true,
    });
    expect(capturedPath).toBe(
      '/graph/procedures/proc-1/export?format=yaml&preserve_namespaces=true'
    );
    expect(result).toEqual(payload);
  });

  it('list requires organization_id', async () => {
    const http = { get: async () => ({}) } as unknown as LoxtepHttpClient;
    const api = createProceduresApi(http);
    await expect(api.list()).rejects.toThrow(/organization_id is required/);
  });
});
