/**
 * Entity definition projection inference.
 *
 *   POST /entities/entities/{entity_definition_id}/projections/infer
 *   Body: { linked_data_product_ids? } — the id stays on the path.
 */

import type { LoxtepHttpClient } from '../http/client.js';

function unwrapData<T>(res: unknown): T {
  return ((res as { data?: T }).data ?? res) as T;
}

export interface InferEntityProjectionInput {
  linked_data_product_ids?: string[];
}

export interface EntitiesApi {
  infer_projection: (
    entity_definition_id: string,
    body?: InferEntityProjectionInput
  ) => Promise<unknown>;
}

export function createEntitiesApi(http: LoxtepHttpClient): EntitiesApi {
  return {
    async infer_projection(
      entity_definition_id: string,
      body?: InferEntityProjectionInput
    ): Promise<unknown> {
      if (!entity_definition_id) throw new Error('entity_definition_id is required');
      const payload: Record<string, unknown> = {};
      if (body?.linked_data_product_ids !== undefined) {
        payload.linked_data_product_ids = body.linked_data_product_ids;
      }
      const path = `/entities/entities/${encodeURIComponent(entity_definition_id)}/projections/infer`;
      const res = await http.post<unknown>(path, payload);
      return unwrapData(res);
    },
  };
}
