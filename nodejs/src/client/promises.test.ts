import { createPromisesApi } from './promises.js';
import type { LoxtepHttpClient } from '../http/client.js';

const CONTRACT = {
  contract_id: 'c1',
  data_product_id: 'dp1',
  name: 'Orders',
  version: '1.0.0',
};

describe('createPromisesApi get', () => {
  it('does not send project_id unless the api is pinned', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: CONTRACT };
      },
    } as unknown as LoxtepHttpClient;

    await createPromisesApi(http).get('c1');
    expect(capturedPath).toBe('/dataproducts/datacontracts/c1');
  });

  it('appends project_id when the api is pinned to a project', async () => {
    let capturedPath: string | null = null;
    const http = {
      get: async (path: string) => {
        capturedPath = path;
        return { success: true as const, data: CONTRACT };
      },
    } as unknown as LoxtepHttpClient;

    await createPromisesApi(http, {
      project_id: '33333333-3333-4333-8333-333333333333',
    }).get('c1');
    expect(capturedPath).toBe(
      '/dataproducts/datacontracts/c1?project_id=33333333-3333-4333-8333-333333333333'
    );
  });
});
