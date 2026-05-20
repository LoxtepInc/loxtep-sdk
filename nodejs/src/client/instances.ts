/**
 * Instances API. list, get, get_stream_config.
 * Backend: organizations microservice /organizations/instances.
 */

import type { LoxtepHttpClient } from '../http/client.js';
import type { Instance, InstancesListResponse, InstanceDetailResponse } from './instances-types.js';

const INSTANCES_BASE = '/organizations/instances';

/** Stream bus resource names resolved from an instance. */
export interface InstanceStreamConfig {
  Region: string;
  LeoEvent: string;
  LeoStream: string;
  LeoCron: string;
  LeoS3: string;
  LeoKinesisStream: string;
  LeoFirehoseStream: string;
  LeoSettings: string;
}

/**
 * Create the instances API surface.
 */
export function createInstancesApi(http: LoxtepHttpClient): {
  list: () => Promise<{
    items: Instance[];
    pagination: InstancesListResponse['data']['pagination'];
  }>;
  get: (instance_id: string) => Promise<Instance>;
  get_stream_config: (instance_id: string) => Promise<InstanceStreamConfig>;
} {
  return {
    async list() {
      const res = await http.get<unknown>(INSTANCES_BASE);
      const body = res as Partial<InstancesListResponse> & Partial<InstancesListResponse['data']>;
      const nested = body.data;
      const items = (nested?.items ?? body.items ?? []) as Instance[];
      const pagination = nested?.pagination ??
        body.pagination ?? {
          page: 1,
          page_size: 20,
          total: items.length,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        };
      return { items, pagination };
    },

    async get(instance_id: string): Promise<Instance> {
      const res = await http.get<InstanceDetailResponse>(
        `${INSTANCES_BASE}/${encodeURIComponent(instance_id)}`
      );
      return res.data.instance;
    },

    /**
     * Resolve stream bus configuration (DynamoDB tables, Kinesis stream, S3 bucket) for an instance.
     * Calls GET /instances/{instance_id}/stream-config.
     */
    async get_stream_config(instance_id: string): Promise<InstanceStreamConfig> {
      const res = await http.get<{ success: true; data: InstanceStreamConfig }>(
        `/instances/${encodeURIComponent(instance_id)}/stream-config`
      );
      return res.data;
    },
  };
}
