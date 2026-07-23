/**
 * Build SDK ingest workflow bundle files (connector + connection + source data product).
 */

import { randomUUID } from 'node:crypto';

export interface SdkIngestBundleParams {
  organization_id: string;
  project_id: string;
  domain_id: string;
  connector_id: string;
  data_product_name: string;
  workflow_name?: string;
  user_id?: string;
  workflow_id?: string;
  connection_id?: string;
  data_product_id?: string;
}

export interface SdkIngestBundleResult {
  workflow_id: string;
  connection_id: string;
  data_product_id: string;
  data_product_name: string;
  files: Record<string, Record<string, unknown>>;
}

export function buildSdkIngestBundle(params: SdkIngestBundleParams): SdkIngestBundleResult {
  const workflowId = params.workflow_id ?? randomUUID();
  const connectionId = params.connection_id ?? randomUUID();
  const dataProductId = params.data_product_id ?? randomUUID();
  const now = new Date().toISOString();
  const workflowName = params.workflow_name ?? 'SDK App Events Ingest';

  const files: Record<string, Record<string, unknown>> = {
    'workflow.json': {
      workflow_id: workflowId,
      organization_id: params.organization_id,
      project_id: params.project_id,
      name: workflowName,
      workflow_type: 'ingestion',
      domain_id: params.domain_id,
      status: 'active',
      configuration: {},
      metadata: { ingestion_method: 'sdk' },
      created_at: now,
      updated_at: now,
    },
    [`connections/${connectionId}.json`]: {
      connection_id: connectionId,
      organization_id: params.organization_id,
      project_id: params.project_id,
      workflow_id: workflowId,
      connector_id: params.connector_id,
      key: 'sdk-input',
      name: 'SDK Input',
      type: 'sdk',
      status: 'active',
      configuration: {
        sdk_type: 'nodejs',
        event_type: params.data_product_name,
      },
      created_at: now,
      updated_at: now,
    },
    [`data-products/${dataProductId}.json`]: {
      data_product_id: dataProductId,
      organization_id: params.organization_id,
      project_id: params.project_id,
      workflow_id: workflowId,
      upstream_entity_id: connectionId,
      upstream_entity_type: 'connections',
      domain_id: params.domain_id,
      name: params.data_product_name,
      kind: 'source',
      status: 'draft',
      owner: params.user_id ? { user_id: params.user_id } : {},
      governance: {
        classification: 'internal',
        pii_fields: [],
        compliance_requirements: [],
        tags: [],
      },
      metadata: {},
      created_at: now,
      updated_at: now,
    },
  };

  return {
    workflow_id: workflowId,
    connection_id: connectionId,
    data_product_id: dataProductId,
    data_product_name: params.data_product_name,
    files,
  };
}
