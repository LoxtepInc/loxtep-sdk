/**
 * Generated TypeScript types from API Zod schemas. Do not edit by hand.
 * Regenerate: pnpm run generate:api-types
 * Source: scripts/api-schemas.ts
 */

export type PaginationMetaApi = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

export type DataProductApi = {
  data_product_id: string;
  organization_id: string;
  domain_id: string;
  project_id?: string | undefined;
  name: string;
  description: string;
  status: string;
  owner: {
    user_id: string;
    team?: string | undefined;
  };
  schema?:
    | {
        [x: string]: unknown;
      }
    | undefined;
  ingestion?:
    | {
        [x: string]: unknown;
      }
    | undefined;
  storage?:
    | {
        [x: string]: unknown;
      }
    | undefined;
  consumption?:
    | {
        [x: string]: unknown;
      }
    | undefined;
  governance?:
    | {
        [x: string]: unknown;
      }
    | undefined;
  quality?:
    | {
        [x: string]: unknown;
      }
    | undefined;
  lineage?:
    | {
        [x: string]: unknown;
      }
    | undefined;
  metadata?:
    | {
        [x: string]: unknown;
      }
    | undefined;
  created_at: string;
  updated_at: string;
  deleted_at?: (string | null) | undefined;
  created_by?: string | undefined;
  updated_by?: string | undefined;
};

export type FlowApi = {
  workflow_id: string;
  project_id: string;
  name: string;
  connection_id?: string | undefined;
  template_id?: string | undefined;
  configuration: {
    [x: string]: unknown;
  };
  deployment: {
    [x: string]: unknown;
  };
  status: 'active' | 'paused' | 'error' | 'inactive';
  metrics: {
    [x: string]: unknown;
  };
  node_count?: number | undefined;
  created_at: string;
  updated_at: string;
  deleted_at?: string | undefined;
};

export type FlowNodeApi = {
  node_id: string;
  workflow_id: string;
  name: string;
  type: 'ingestion' | 'transformation' | 'export';
  node_subtype?: string | undefined;
  webhook_id?: string | undefined;
  configuration?:
    | {
        [x: string]: unknown;
      }
    | undefined;
  created_at: string;
  updated_at: string;
  deleted_at?: string | undefined;
};

export type ConnectionApi = {
  connection_id: string;
  organization_id?: (string | null) | undefined;
  key: string;
  name: string;
  type: string;
  status: string;
  data: string;
  configuration: {
    [x: string]: unknown;
  };
  metadata: {
    [x: string]: unknown;
  };
  verified: boolean;
  draft: boolean;
  last_tested?: (string | null) | undefined;
  created_by?: (string | null) | undefined;
  updated_by?: (string | null) | undefined;
  created_at: string;
  updated_at: string;
  deleted_at?: (string | null) | undefined;
};

export type QueueMetadataApi = {
  queue_id?: string | undefined;
  queue_name?: string | undefined;
  checkpoints?:
    | {
        [x: string]: unknown;
      }[]
    | undefined;
  readers?:
    | {
        [x: string]: unknown;
      }[]
    | undefined;
  writers?:
    | {
        [x: string]: unknown;
      }[]
    | undefined;
  stats?:
    | {
        [x: string]: unknown;
      }
    | undefined;
};

export type QueueEventApi = {
  event_id?: string | undefined;
  payload?: unknown | undefined;
  timestamp?: string | undefined;
};

export type QualityMetricApi = {
  metric_id?: string | undefined;
  data_product_id?: string | undefined;
  metric_type?: string | undefined;
  value?: number | undefined;
  threshold?: number | undefined;
  status?: string | undefined;
  severity?: string | undefined;
  measured_at?: string | undefined;
  created_at?: string | undefined;
};
