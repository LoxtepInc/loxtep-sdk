/**
 * API contract schemas (Zod). Source of truth for generate-api-types script.
 * All fields snake_case per backend conventions. Not shipped in SDK bundle.
 */

import { z } from 'zod';

export const PaginationMetaSchema = z.object({
  page: z.number(),
  page_size: z.number(),
  total: z.number(),
  total_pages: z.number(),
  has_next: z.boolean(),
  has_prev: z.boolean(),
});

export const DataProductSchema = z
  .object({
    data_product_id: z.string(),
    organization_id: z.string(),
    domain_id: z.string(),
    project_id: z.string().optional(),
    name: z.string(),
    description: z.string(),
    status: z.string(),
    owner: z.object({ user_id: z.string(), team: z.string().optional() }),
    schema: z.record(z.unknown()).optional(),
    ingestion: z.record(z.unknown()).optional(),
    storage: z.record(z.unknown()).optional(),
    delivery: z.record(z.unknown()).optional(),
    governance: z.record(z.unknown()).optional(),
    quality: z.record(z.unknown()).optional(),
    lineage: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
    created_at: z.string(),
    updated_at: z.string(),
    deleted_at: z.string().nullable().optional(),
    created_by: z.string().optional(),
    updated_by: z.string().optional(),
  })
  .passthrough();

export const FlowSchema = z
  .object({
    workflow_id: z.string(),
    project_id: z.string(),
    name: z.string(),
    connection_id: z.string().optional(),
    template_id: z.string().optional(),
    configuration: z.record(z.unknown()),
    deployment: z.record(z.unknown()),
    status: z.enum(['active', 'paused', 'error', 'inactive']),
    metrics: z.record(z.unknown()),
    node_count: z.number().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    deleted_at: z.string().optional(),
  })
  .passthrough();

export const FlowNodeSchema = z
  .object({
    node_id: z.string(),
    workflow_id: z.string(),
    name: z.string(),
    type: z.enum(['ingestion', 'transformation', 'export']),
    node_subtype: z.string().optional(),
    webhook_id: z.string().optional(),
    configuration: z.record(z.unknown()).optional(),
    created_at: z.string(),
    updated_at: z.string(),
    deleted_at: z.string().optional(),
  })
  .passthrough();

export const ConnectionSchema = z
  .object({
    connection_id: z.string(),
    organization_id: z.string().nullable().optional(),
    key: z.string(),
    name: z.string(),
    type: z.string(),
    status: z.string(),
    data: z.string(),
    configuration: z.record(z.unknown()),
    metadata: z.record(z.unknown()),
    verified: z.boolean(),
    draft: z.boolean(),
    last_tested: z.string().nullable().optional(),
    created_by: z.string().nullable().optional(),
    updated_by: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    deleted_at: z.string().nullable().optional(),
  })
  .passthrough();

export const QueueMetadataSchema = z
  .object({
    queue_id: z.string().optional(),
    queue_name: z.string().optional(),
    checkpoints: z.array(z.record(z.unknown())).optional(),
    readers: z.array(z.record(z.unknown())).optional(),
    writers: z.array(z.record(z.unknown())).optional(),
    stats: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const QueueEventSchema = z
  .object({
    event_id: z.string().optional(),
    payload: z.unknown().optional(),
    timestamp: z.string().optional(),
  })
  .passthrough();

export const QualityMetricSchema = z
  .object({
    metric_id: z.string().optional(),
    data_product_id: z.string().optional(),
    metric_type: z.string().optional(),
    value: z.number().optional(),
    threshold: z.number().optional(),
    status: z.string().optional(),
    severity: z.string().optional(),
    measured_at: z.string().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();
