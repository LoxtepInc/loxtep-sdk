/**
 * BYOL custom Lambda bots API.
 * REST: /organizations/instances/{instance_id}/custom-bots
 */

import type { LoxtepHttpClient } from '../http/client.js';

const customBotsBase = (instanceId: string) =>
  `/organizations/instances/${encodeURIComponent(instanceId)}/custom-bots`;

export interface CustomBotRegisterInput {
  name: string;
  lambda_name: string;
  slug?: string;
  description?: string;
  source_queue?: string;
  destination_queue?: string;
  error_queue?: string;
  schedule?: string | null;
  batch_size?: number;
  paused?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type CustomBotUpdateInput = Partial<CustomBotRegisterInput>;

function unwrapData<T = unknown>(res: unknown): T {
  if (res && typeof res === 'object' && 'data' in (res as Record<string, unknown>)) {
    return (res as { data: T }).data;
  }
  return res as T;
}

/**
 * Create the custom-bots API surface (BYOL LeoCron registration).
 */
export function createCustomBotsApi(http: LoxtepHttpClient): {
  list: (instance_id: string) => Promise<unknown>;
  get: (instance_id: string, bot_id: string) => Promise<unknown>;
  register: (instance_id: string, input: CustomBotRegisterInput) => Promise<unknown>;
  update: (
    instance_id: string,
    bot_id: string,
    input: CustomBotUpdateInput,
  ) => Promise<unknown>;
  deregister: (instance_id: string, bot_id: string) => Promise<unknown>;
  reconcile: (instance_id: string) => Promise<unknown>;
} {
  return {
    async list(instance_id: string) {
      const res = await http.get<unknown>(customBotsBase(instance_id));
      return unwrapData(res);
    },

    async get(instance_id: string, bot_id: string) {
      const res = await http.get<unknown>(
        `${customBotsBase(instance_id)}/${encodeURIComponent(bot_id)}`,
      );
      return unwrapData(res);
    },

    async register(instance_id: string, input: CustomBotRegisterInput) {
      const res = await http.post<unknown>(customBotsBase(instance_id), input);
      return unwrapData(res);
    },

    async update(
      instance_id: string,
      bot_id: string,
      input: CustomBotUpdateInput,
    ) {
      const res = await http.put<unknown>(
        `${customBotsBase(instance_id)}/${encodeURIComponent(bot_id)}`,
        input,
      );
      return unwrapData(res);
    },

    async deregister(instance_id: string, bot_id: string) {
      const res = await http.delete<unknown>(
        `${customBotsBase(instance_id)}/${encodeURIComponent(bot_id)}`,
      );
      return unwrapData(res);
    },

    async reconcile(instance_id: string) {
      const res = await http.get<unknown>(`${customBotsBase(instance_id)}/reconcile`);
      return unwrapData(res);
    },
  };
}

export type CustomBotsApi = ReturnType<typeof createCustomBotsApi>;
