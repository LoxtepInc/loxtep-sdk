/**
 * Build local-first SDK ingest workflow package files
 * (connector + workflow + connection + source data product).
 */

import { randomUUID } from 'node:crypto';
import type { Connector } from '../client/connectors-types.js';
import { EntityType, validateEntity } from './entity-json-schemas/index.js';

/** Placeholder starter template id for SDK-provisioned ingestion flows. */
export const SDK_INGEST_TEMPLATE_ID = '00000000-0000-4000-8000-0000000000a1';

export interface SdkIngestPackageParams {
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
  /** When set, include a schema-valid local connector file. */
  connector?: Connector | LocalConnectorStub;
  include_connector_file?: boolean;
}

export interface LocalConnectorStub {
  connector_id: string;
  organization_id: string;
  connector_type: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface SdkIngestPackageResult {
  workflow_id: string;
  connection_id: string;
  data_product_id: string;
  data_product_name: string;
  connector_id: string;
  /** Project-relative path → entity JSON */
  files: Record<string, Record<string, unknown>>;
}

/**
 * Map an API connector (or stub) into a schema-valid local connector entity.
 * Entity schema uses catalog-style fields (name, category, auth_type) that differ
 * from the connectors API shape.
 */
export function toLocalConnectorEntity(
  connector: Connector | LocalConnectorStub,
  now = new Date().toISOString()
): Record<string, unknown> {
  const meta = connector.metadata ?? {};
  const name =
    (typeof meta.name === 'string' && meta.name.trim()) ||
    `${connector.connector_type} connector`;
  const description =
    (typeof meta.description === 'string' && meta.description.trim()) ||
    `Local stub for ${connector.connector_type} connector`;

  return {
    connector_id: connector.connector_id,
    organization_id: connector.organization_id,
    connector_type: connector.connector_type,
    name,
    description,
    category: 'custom',
    // Entity schema enum has no "jwt"; use custom and keep API auth in metadata.
    auth_type: 'custom',
    version: '1.0.0',
    metadata: { ...meta, sdk_auth_type: 'jwt' },
    created_at: connector.created_at ?? now,
    updated_at: connector.updated_at ?? now,
  };
}

/**
 * Build project-local JSON files for an SDK ingest topology.
 * Paths match the customer workspace layout (not the flat save_workflow_bundle map).
 */
export function buildSdkIngestLocalPackage(
  params: SdkIngestPackageParams
): SdkIngestPackageResult {
  const workflowId = params.workflow_id ?? randomUUID();
  const connectionId = params.connection_id ?? randomUUID();
  const dataProductId = params.data_product_id ?? randomUUID();
  const now = new Date().toISOString();
  const workflowName = params.workflow_name ?? 'SDK App Events Ingest';

  const files: Record<string, Record<string, unknown>> = {};

  if (params.include_connector_file !== false && params.connector) {
    files[`connectors/${params.connector_id}.json`] = toLocalConnectorEntity(
      params.connector,
      now
    );
  }

  files[`workflows/${workflowId}/workflow.json`] = {
    workflow_id: workflowId,
    organization_id: params.organization_id,
    project_id: params.project_id,
    name: workflowName,
    template_id: SDK_INGEST_TEMPLATE_ID,
    workflow_type: 'ingestion',
    domain_id: params.domain_id,
    status: 'active',
    configuration: {},
    metadata: { ingestion_method: 'sdk' },
    created_at: now,
    updated_at: now,
  };

  files[`workflows/${workflowId}/connections/${connectionId}.json`] = {
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
  };

  const dataProduct: Record<string, unknown> = {
    data_product_id: dataProductId,
    organization_id: params.organization_id,
    workflow_id: workflowId,
    upstream_entity_id: connectionId,
    upstream_entity_type: 'connections',
    domain_id: params.domain_id,
    name: params.data_product_name,
    status: 'draft',
    governance: {
      classification: 'internal',
      pii_fields: [],
      compliance_requirements: [],
      tags: [],
    },
    metadata: {
      kind: 'source',
      project_id: params.project_id,
    },
    created_at: now,
    updated_at: now,
  };
  if (params.user_id) {
    dataProduct.owner = { user_id: params.user_id };
  }
  files[`workflows/${workflowId}/data-products/${dataProductId}.json`] = dataProduct;

  return {
    workflow_id: workflowId,
    connection_id: connectionId,
    data_product_id: dataProductId,
    data_product_name: params.data_product_name,
    connector_id: params.connector_id,
    files,
  };
}

/**
 * Flat bundle map for `save_workflow_bundle` / `bundle save` (workflow-relative keys).
 */
export function buildSdkIngestBundle(params: {
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
}): {
  workflow_id: string;
  connection_id: string;
  data_product_id: string;
  data_product_name: string;
  files: Record<string, Record<string, unknown>>;
} {
  const local = buildSdkIngestLocalPackage({ ...params, include_connector_file: false });
  const wf = local.workflow_id;
  const files: Record<string, Record<string, unknown>> = {
    'workflow.json': local.files[`workflows/${wf}/workflow.json`],
    [`connections/${local.connection_id}.json`]:
      local.files[`workflows/${wf}/connections/${local.connection_id}.json`],
    [`data-products/${local.data_product_id}.json`]:
      local.files[`workflows/${wf}/data-products/${local.data_product_id}.json`],
  };
  return {
    workflow_id: local.workflow_id,
    connection_id: local.connection_id,
    data_product_id: local.data_product_id,
    data_product_name: local.data_product_name,
    files,
  };
}

export type SdkIngestBundleParams = Parameters<typeof buildSdkIngestBundle>[0];
export type SdkIngestBundleResult = ReturnType<typeof buildSdkIngestBundle>;

/** Validate every entity in a local package map; returns field-level errors. */
export function validateSdkIngestPackageFiles(
  files: Record<string, Record<string, unknown>>
): Array<{ path: string; entity_type: string; message: string }> {
  const errors: Array<{ path: string; entity_type: string; message: string }> = [];

  for (const [path, entity] of Object.entries(files)) {
    let entityType: (typeof EntityType)[keyof typeof EntityType] | null = null;
    if (path.startsWith('connectors/') && path.endsWith('.json')) {
      entityType = EntityType.CONNECTOR;
    } else if (path.endsWith('/workflow.json') || path === 'workflow.json') {
      entityType = EntityType.WORKFLOW;
    } else if (path.includes('/connections/') || path.startsWith('connections/')) {
      entityType = EntityType.CONNECTION;
    } else if (path.includes('/data-products/') || path.startsWith('data-products/')) {
      entityType = EntityType.DATA_PRODUCT;
    }

    if (!entityType) continue;

    const result = validateEntity(entityType, entity);
    if (!result.valid && result.errors) {
      for (const err of result.errors) {
        errors.push({
          path: `${path}${err.path}`,
          entity_type: entityType,
          message: err.message,
        });
      }
    }
  }

  return errors;
}
