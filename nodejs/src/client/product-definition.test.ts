/**
 * Unit tests for product definition API (MCP + thin REST).
 */

import { createProductDefinitionApi } from './product-definition.js';
import type { LoxtepHttpClient } from '../http/client.js';

function mcpOk(payload: unknown) {
  return {
    success: true,
    data: {
      content: [{ type: 'text', text: JSON.stringify({ success: true, data: payload }) }],
    },
  };
}

describe('createProductDefinitionApi', () => {
  it('get_definition_status uses REST GET', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { data: { data_product_id: 'dp-1', blockers: [] } };
      },
      post: async () => {
        throw new Error('unexpected post');
      },
    } as unknown as LoxtepHttpClient;

    const api = createProductDefinitionApi(http);
    const result = await api.get_definition_status('dp-1');

    expect(capturedPath).toBe(
      '/semantic-layer/product-definition?data_product_id=dp-1'
    );
    expect(result).toEqual({ data_product_id: 'dp-1', blockers: [] });
  });

  it('approve_definition_proposal uses REST POST action', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      get: async () => {
        throw new Error('unexpected get');
      },
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { data: { semantic_proposal_id: 'sp-1', disposition: 'accepted' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createProductDefinitionApi(http);
    await api.approve_definition_proposal('sp-1');

    expect(capturedPath).toBe('/semantic-layer/product-definition');
    expect(capturedBody).toEqual({ action: 'approve', semantic_proposal_id: 'sp-1' });
  });

  it('submit_shape_proposal calls MCP loxtep_define facade', async () => {
    let capturedBody: unknown = null;
    const http = {
      get: async () => {
        throw new Error('unexpected get');
      },
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return mcpOk({ semantic_proposal_id: 'sp-new' });
      },
    } as unknown as LoxtepHttpClient;

    const api = createProductDefinitionApi(http);
    const result = await api.submit_shape_proposal({
      data_product_id: 'dp-1',
      proposed_definition: { fields: [] },
      rationale: 'from samples',
    });

    expect(capturedBody).toEqual({
      name: 'loxtep_define',
      arguments: {
        operation: 'submit_shape_proposal',
        data_product_id: 'dp-1',
        proposed_definition: { fields: [] },
        rationale: 'from samples',
      },
    });
    expect(result).toEqual({ semantic_proposal_id: 'sp-new' });
  });

  it('get_definition_evidence calls MCP facade', async () => {
    let capturedBody: unknown = null;
    const http = {
      get: async () => {
        throw new Error('unexpected get');
      },
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return mcpOk({ evidence_id: 'ev-1' });
      },
    } as unknown as LoxtepHttpClient;

    const api = createProductDefinitionApi(http);
    await api.get_definition_evidence('dp-1');

    expect(capturedBody).toEqual({
      name: 'loxtep_define',
      arguments: { operation: 'get_definition_evidence', data_product_id: 'dp-1' },
    });
  });

  it('throws when MCP tool returns success:false', async () => {
    const http = {
      get: async () => {
        throw new Error('unexpected get');
      },
      post: async () => ({
        data: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, error: 'conflict' }),
            },
          ],
        },
      }),
    } as unknown as LoxtepHttpClient;

    const api = createProductDefinitionApi(http);
    await expect(api.get_definition_skill()).rejects.toThrow('conflict');
  });
});
