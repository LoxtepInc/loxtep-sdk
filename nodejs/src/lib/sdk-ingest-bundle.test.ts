import { buildSdkIngestBundle } from '../lib/sdk-ingest-bundle.js';

describe('buildSdkIngestBundle', () => {
  it('builds workflow, connection, and data product files', () => {
    const result = buildSdkIngestBundle({
      organization_id: 'org-001',
      project_id: 'project-001',
      domain_id: 'domain-001',
      connector_id: 'connector-001',
      data_product_name: 'app-events',
      workflow_id: 'wf-fixed',
      connection_id: 'conn-fixed',
      data_product_id: 'dp-fixed',
    });

    expect(result.workflow_id).toBe('wf-fixed');
    expect(result.files['workflow.json']).toMatchObject({
      workflow_id: 'wf-fixed',
      workflow_type: 'ingestion',
    });
    expect(result.files['connections/conn-fixed.json']).toMatchObject({
      connector_id: 'connector-001',
      type: 'sdk',
    });
    expect(result.files['data-products/dp-fixed.json']).toMatchObject({
      name: 'app-events',
      kind: 'source',
      upstream_entity_id: 'conn-fixed',
    });
  });
});
