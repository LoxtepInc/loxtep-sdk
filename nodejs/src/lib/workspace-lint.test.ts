/**
 * Regression tests for offline workspace lint (trigger types, entity ID indexing,
 * upstream references, wrong-type / missing refs).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isDataProductTriggerConnection,
  lintLocalPackage,
  primaryEntityId,
} from './workspace-lint.js';
import { EntityType } from './entity-json-schemas/index.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const DOMAIN = '33333333-3333-4333-8333-333333333333';
const WF = '44444444-4444-4444-8444-444444444444';
const CONN = '55555555-5555-4555-8555-555555555555';
const XF = '66666666-6666-4666-8666-666666666666';
const DP = '77777777-7777-4777-8777-777777777777';
const VAL = '88888888-8888-4888-8888-888888888888';
const CONNECTOR = '99999999-9999-4999-8999-999999999999';
const NOW = '2026-08-04T12:00:00.000Z';
const TEMPLATE = '00000000-0000-4000-8000-0000000000a1';

function writeJson(root: string, rel: string, data: Record<string, unknown>): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2));
}

function baseWorkflow(): Record<string, unknown> {
  return {
    workflow_id: WF,
    organization_id: ORG,
    project_id: PROJECT,
    name: 'Enrichment flow',
    template_id: TEMPLATE,
    workflow_type: 'enrichment',
    domain_id: DOMAIN,
    status: 'active',
    configuration: {},
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
  };
}

function triggerConnection(type: string): Record<string, unknown> {
  return {
    connection_id: CONN,
    organization_id: ORG,
    project_id: PROJECT,
    workflow_id: WF,
    key: 'data-product-trigger',
    name: 'From upstream DP',
    type,
    status: 'active',
    configuration: {
      source_data_product_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
    created_at: NOW,
    updated_at: NOW,
  };
}

function transformation(): Record<string, unknown> {
  return {
    transformation_id: XF,
    organization_id: ORG,
    project_id: PROJECT,
    workflow_id: WF,
    name: 'select-fields',
    upstream_entity_id: CONN,
    upstream_entity_type: 'connections',
    transform_type: 'select_fields',
    operation_config: { fields: ['id', 'name'] },
    created_at: NOW,
    updated_at: NOW,
  };
}

function dataProduct(upstreamId: string, upstreamType: string): Record<string, unknown> {
  return {
    data_product_id: DP,
    organization_id: ORG,
    workflow_id: WF,
    domain_id: DOMAIN,
    name: 'enriched-events',
    status: 'draft',
    upstream_entity_id: upstreamId,
    upstream_entity_type: upstreamType,
    governance: {
      classification: 'internal',
      pii_fields: [],
      compliance_requirements: [],
      tags: [],
    },
    metadata: { kind: 'consumer', project_id: PROJECT },
    created_at: NOW,
    updated_at: NOW,
  };
}

describe('isDataProductTriggerConnection', () => {
  it('accepts canonical hyphen spelling', () => {
    expect(isDataProductTriggerConnection({ type: 'data-product-trigger' })).toBe(true);
  });

  it('rejects legacy underscore spelling', () => {
    expect(isDataProductTriggerConnection({ type: 'data_product_trigger' })).toBe(false);
  });

  it('accepts connector_type when type is absent', () => {
    expect(isDataProductTriggerConnection({ connector_type: 'data-product-trigger' })).toBe(true);
  });

  it('rejects other connector types', () => {
    expect(isDataProductTriggerConnection({ type: 'webhook' })).toBe(false);
  });
});

describe('primaryEntityId', () => {
  it('uses transformation_id even when workflow_id is present', () => {
    expect(
      primaryEntityId({
        entityType: EntityType.TRANSFORMATION,
        data: { transformation_id: XF, workflow_id: WF },
      })
    ).toBe(XF);
  });

  it('uses validation_id even when workflow_id is present', () => {
    expect(
      primaryEntityId({
        entityType: EntityType.VALIDATION,
        data: { validation_id: VAL, workflow_id: WF },
      })
    ).toBe(VAL);
  });

  it('uses connection_id even when connector_id is present', () => {
    expect(
      primaryEntityId({
        entityType: EntityType.CONNECTION,
        data: { connection_id: CONN, connector_id: CONNECTOR, workflow_id: WF },
      })
    ).toBe(CONN);
  });
});

describe('lintLocalPackage trigger + upstream regressions', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loxtep-ws-lint-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeEnrichmentPackage(triggerType: string): void {
    writeJson(dir, `workflows/${WF}/workflow.json`, baseWorkflow());
    writeJson(dir, `workflows/${WF}/connections/${CONN}.json`, triggerConnection(triggerType));
    writeJson(dir, `workflows/${WF}/transformations/${XF}.json`, transformation());
    writeJson(dir, `workflows/${WF}/data-products/${DP}.json`, dataProduct(XF, 'transformations'));
  }

  it('passes for data-product-trigger without connector_id when upstream transform exists', () => {
    writeEnrichmentPackage('data-product-trigger');
    const result = lintLocalPackage({ projectDir: dir, workflow_id: WF });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('fails for legacy data_product_trigger spelling', () => {
    writeEnrichmentPackage('data_product_trigger');
    const result = lintLocalPackage({ projectDir: dir, workflow_id: WF });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        i =>
          i.message.includes('data-product-trigger') &&
          i.message.includes('data_product_trigger')
      )
    ).toBe(true);
  });

  it('indexes entities that also carry parent workflow_id / connector_id', () => {
    writeJson(dir, `workflows/${WF}/workflow.json`, baseWorkflow());
    writeJson(dir, `workflows/${WF}/connections/${CONN}.json`, {
      ...triggerConnection('data-product-trigger'),
      // parent/reference IDs must not steal the entity's own index key
      connector_id: CONNECTOR,
    });
    writeJson(dir, `workflows/${WF}/transformations/${XF}.json`, transformation());
    writeJson(dir, `workflows/${WF}/validations/${VAL}.json`, {
      validation_id: VAL,
      organization_id: ORG,
      project_id: PROJECT,
      workflow_id: WF,
      name: 'require-id',
      upstream_entity_id: XF,
      upstream_entity_type: 'transformations',
      validation_type: 'schema',
      rules: { schema: { type: 'object' } },
      severity: 'error',
      created_at: NOW,
      updated_at: NOW,
    });
    writeJson(dir, `workflows/${WF}/data-products/${DP}.json`, dataProduct(VAL, 'validations'));

    const result = lintLocalPackage({ projectDir: dir, workflow_id: WF });
    // connector_id present on trigger is fine; trigger still exempt from local connectors/ check
    // but when connectors/ is empty and connector_id is set, no local lookup error.
    expect(result.issues.filter(i => i.message.includes('upstream_entity_id'))).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when upstream transformation is genuinely missing', () => {
    writeJson(dir, `workflows/${WF}/workflow.json`, baseWorkflow());
    writeJson(dir, `workflows/${WF}/connections/${CONN}.json`, triggerConnection('data-product-trigger'));
    writeJson(
      dir,
      `workflows/${WF}/data-products/${DP}.json`,
      dataProduct('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'transformations')
    );

    const result = lintLocalPackage({ projectDir: dir, workflow_id: WF });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        i =>
          i.message.includes('upstream_entity_id') &&
          i.message.includes('not found as transformations')
      )
    ).toBe(true);
  });

  it('fails when upstream_entity_type does not match the referenced entity', () => {
    writeEnrichmentPackage('data-product-trigger');
    writeJson(
      dir,
      `workflows/${WF}/data-products/${DP}.json`,
      dataProduct(CONN, 'transformations')
    );

    const result = lintLocalPackage({ projectDir: dir, workflow_id: WF });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        i =>
          i.message.includes('is a connections entity') &&
          i.message.includes('upstream_entity_type is "transformations"')
      )
    ).toBe(true);
  });

  it('still requires connector_id for non-trigger connections', () => {
    writeJson(dir, `workflows/${WF}/workflow.json`, baseWorkflow());
    writeJson(dir, `workflows/${WF}/connections/${CONN}.json`, {
      connection_id: CONN,
      organization_id: ORG,
      project_id: PROJECT,
      workflow_id: WF,
      key: 'webhook-source',
      name: 'Webhook',
      type: 'webhook',
      status: 'active',
      created_at: NOW,
      updated_at: NOW,
    });
    writeJson(dir, `workflows/${WF}/data-products/${DP}.json`, dataProduct(CONN, 'connections'));

    const result = lintLocalPackage({ projectDir: dir, workflow_id: WF });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.message.includes('missing connector_id'))).toBe(true);
  });
});
