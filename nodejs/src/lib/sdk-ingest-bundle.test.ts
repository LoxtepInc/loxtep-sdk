import {
  buildSdkIngestBundle,
  buildSdkIngestLocalPackage,
  SDK_INGEST_TEMPLATE_ID,
  validateSdkIngestPackageFiles,
} from '../lib/sdk-ingest-bundle.js';
import { EntityType, validateEntity } from '../lib/entity-json-schemas/index.js';
import { lintLocalPackage } from '../lib/workspace-lint.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ORG = '22222222-2222-4222-8222-222222222222';
const PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOMAIN = '33333333-3333-4333-8333-333333333333';
const CONNECTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = '11111111-1111-4111-8111-111111111111';
const WF = '66666666-6666-4666-8666-666666666666';
const CONN = '77777777-7777-4777-8777-777777777777';
const DP = '55555555-5555-4555-8555-555555555555';

describe('entity-json-schemas validateEntity', () => {
  it('accepts a minimal valid connection', () => {
    const result = validateEntity(EntityType.CONNECTION, {
      connection_id: CONN,
      organization_id: ORG,
      project_id: PROJECT,
      key: 'sdk-input',
      name: 'SDK Input',
      type: 'sdk',
      status: 'active',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = validateEntity(EntityType.WORKFLOW, { name: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});

describe('buildSdkIngestLocalPackage', () => {
  it('writes schema-valid local package paths', () => {
    const result = buildSdkIngestLocalPackage({
      organization_id: ORG,
      project_id: PROJECT,
      domain_id: DOMAIN,
      connector_id: CONNECTOR,
      data_product_name: 'app-events',
      user_id: USER,
      workflow_id: WF,
      connection_id: CONN,
      data_product_id: DP,
      connector: {
        connector_id: CONNECTOR,
        organization_id: ORG,
        connector_type: 'sdk',
        metadata: { name: 'SDK' },
      },
    });

    expect(result.files[`workflows/${WF}/workflow.json`]).toMatchObject({
      template_id: SDK_INGEST_TEMPLATE_ID,
      workflow_type: 'ingestion',
    });
    expect(result.files[`connectors/${CONNECTOR}.json`]).toMatchObject({
      connector_type: 'sdk',
      category: 'custom',
      auth_type: 'custom',
    });

    const errors = validateSdkIngestPackageFiles(result.files);
    expect(errors).toEqual([]);
  });
});

describe('buildSdkIngestBundle', () => {
  it('builds flat workflow-relative files', () => {
    const result = buildSdkIngestBundle({
      organization_id: ORG,
      project_id: PROJECT,
      domain_id: DOMAIN,
      connector_id: CONNECTOR,
      data_product_name: 'app-events',
      workflow_id: WF,
      connection_id: CONN,
      data_product_id: DP,
    });

    expect(result.workflow_id).toBe(WF);
    expect(result.files['workflow.json']).toMatchObject({
      workflow_id: WF,
      workflow_type: 'ingestion',
    });
    expect(result.files[`connections/${CONN}.json`]).toMatchObject({
      connector_id: CONNECTOR,
      type: 'sdk',
    });
    expect(result.files[`data-products/${DP}.json`]).toMatchObject({
      name: 'app-events',
      upstream_entity_id: CONN,
      metadata: { kind: 'source' },
    });
  });
});

describe('lintLocalPackage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loxtep-lint-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes for a valid local package', () => {
    const pkg = buildSdkIngestLocalPackage({
      organization_id: ORG,
      project_id: PROJECT,
      domain_id: DOMAIN,
      connector_id: CONNECTOR,
      data_product_name: 'app-events',
      user_id: USER,
      workflow_id: WF,
      connection_id: CONN,
      data_product_id: DP,
      connector: {
        connector_id: CONNECTOR,
        organization_id: ORG,
        connector_type: 'sdk',
        metadata: { name: 'SDK' },
      },
    });

    for (const [rel, entity] of Object.entries(pkg.files)) {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, JSON.stringify(entity, null, 2));
    }

    const result = lintLocalPackage({ projectDir: dir, workflow_id: WF });
    expect(result.ok).toBe(true);
  });

  it('fails on bad JSON shape', () => {
    mkdirSync(join(dir, 'workflows', WF), { recursive: true });
    writeFileSync(join(dir, 'workflows', WF, 'workflow.json'), JSON.stringify({ name: 'broken' }));
    const result = lintLocalPackage({ projectDir: dir, workflow_id: WF });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
