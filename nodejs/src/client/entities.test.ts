import { createEntitiesApi } from './entities.js';
import type { LoxtepHttpClient } from '../http/client.js';

describe('createEntitiesApi', () => {
  it('infer_projection POSTs the doubled path and omits the id from the body', async () => {
    let capturedPath: string | null = null;
    let capturedBody: unknown = null;
    const http = {
      post: async (path: string, body: unknown) => {
        capturedPath = path;
        capturedBody = body;
        return { success: true as const, data: { enqueued: true } };
      },
    } as unknown as LoxtepHttpClient;

    const api = createEntitiesApi(http);
    const empty = await api.infer_projection('ent-1');
    expect(capturedPath).toBe('/entities/entities/ent-1/projections/infer');
    expect(capturedBody).toEqual({});
    expect(empty).toEqual({ enqueued: true });

    await api.infer_projection('ent-1', { linked_data_product_ids: ['dp-1'] });
    expect(capturedBody).toEqual({ linked_data_product_ids: ['dp-1'] });
  });
});
