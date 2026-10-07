/**
 * Unit tests for workflows preview/run query_trigger (MCP loxtep_build).
 */

import { createWorkflowsApi } from './workflows.js';
import type { LoxtepHttpClient } from '../http/client.js';

function mcpOk(payload: unknown) {
  return {
    success: true,
    data: {
      content: [{ type: 'text', text: JSON.stringify({ success: true, data: payload }) }],
    },
  };
}

describe('workflows query_trigger MCP methods', () => {
  it('preview_query_trigger calls loxtep_build facade', async () => {
    let capturedBody: unknown = null;
    const http = {
      get: async () => {
        throw new Error('unexpected get');
      },
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return mcpOk({ rows: [{ city: 'DEN' }], limit: 20 });
      },
    } as unknown as LoxtepHttpClient;

    const api = createWorkflowsApi(http);
    const result = await api.preview_query_trigger({
      workflow_id: '11111111-1111-1111-1111-111111111111',
      query: 'SELECT 1',
      primary_key: ['city'],
      limit: 5,
    });

    expect(capturedBody).toEqual({
      name: 'loxtep_build',
      arguments: {
        operation: 'preview_query_trigger',
        workflow_id: '11111111-1111-1111-1111-111111111111',
        query: 'SELECT 1',
        primary_key: ['city'],
        limit: 5,
      },
    });
    expect(result).toEqual({ rows: [{ city: 'DEN' }], limit: 20 });
  });

  it('run_query_trigger calls loxtep_build facade', async () => {
    let capturedBody: unknown = null;
    const http = {
      get: async () => {
        throw new Error('unexpected get');
      },
      post: async (_path: string, body: unknown) => {
        capturedBody = body;
        return mcpOk({ invoked: true });
      },
    } as unknown as LoxtepHttpClient;

    const api = createWorkflowsApi(http);
    const result = await api.run_query_trigger({
      workflow_id: '11111111-1111-1111-1111-111111111111',
      sink_data_product_id: '22222222-2222-2222-2222-222222222222',
    });

    expect(capturedBody).toEqual({
      name: 'loxtep_build',
      arguments: {
        operation: 'run_query_trigger',
        workflow_id: '11111111-1111-1111-1111-111111111111',
        sink_data_product_id: '22222222-2222-2222-2222-222222222222',
      },
    });
    expect(result).toEqual({ invoked: true });
  });

  it('preview_query_trigger requires workflow_id', async () => {
    const http = {
      get: async () => {
        throw new Error('unexpected get');
      },
      post: async () => {
        throw new Error('unexpected post');
      },
    } as unknown as LoxtepHttpClient;

    const api = createWorkflowsApi(http);
    await expect(api.preview_query_trigger({ workflow_id: '' })).rejects.toThrow(
      'workflow_id is required'
    );
  });
});
