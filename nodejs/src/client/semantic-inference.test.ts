import { createDataProductsApi } from './data-products.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('data_products.semantic_inference', () => {
  it('request, get, and promote use the doubled dataproducts prefix', async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const http = {
      post: async (path: string, body: unknown) => {
        calls.push({ method: 'POST', path, body });
        return { success: true as const, data: { run_id: 'run-1', status: 'queued' } };
      },
      get: async (path: string) => {
        calls.push({ method: 'GET', path });
        return { success: true as const, data: { run_id: 'run-1', status: 'completed' } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createDataProductsApi(http);
    await api.semantic_inference.request('dp-1');
    await api.semantic_inference.get('dp-1');
    await api.semantic_inference.promote('dp-1', {
      run_id: 'run-1',
      action: 'accept',
    });
    await api.semantic_inference.promote('dp-1', {
      run_id: 'run-1',
      action: 'dismiss',
      issue_id: 'iss-1',
    });

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/dataproducts/dataproducts/dp-1/semantic-inference',
      body: {},
    });
    expect(calls[1]).toEqual({
      method: 'GET',
      path: '/dataproducts/dataproducts/dp-1/semantic-inference',
    });
    expect(calls[2]).toEqual({
      method: 'POST',
      path: '/dataproducts/dataproducts/dp-1/semantic-inference/promote',
      body: { run_id: 'run-1', action: 'accept' },
    });
    expect(calls[3]?.body).toEqual({
      run_id: 'run-1',
      action: 'dismiss',
      issue_id: 'iss-1',
    });
  });
});
