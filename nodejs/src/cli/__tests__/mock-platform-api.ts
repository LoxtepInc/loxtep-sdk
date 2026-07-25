/**
 * Mock Loxtep platform API for CLI integration tests.
 * Responses use production `{ success, data }` envelopes and resolved gateway paths.
 */

import { buildPlatformRequestUrl } from '../../config/platform-request-url.js';

export const MOCK_PLATFORM_API = 'https://api.test.loxtep.com';

/** Stable IDs returned by the default mock catalog (UUID-shaped for entity schemas). */
export const MOCK_IDS = {
  user_id: '11111111-1111-4111-8111-111111111111',
  organization_id: '22222222-2222-4222-8222-222222222222',
  domain_id: '33333333-3333-4333-8333-333333333333',
  instance_id: '44444444-4444-4444-8444-444444444444',
  data_product_id: '55555555-5555-4555-8555-555555555555',
  workflow_id: '66666666-6666-4666-8666-666666666666',
  trigger_id: '77777777-7777-4777-8777-777777777777',
  standard_id: '88888888-8888-4888-8888-888888888888',
  contract_id: '99999999-9999-4999-8999-999999999999',
  connector_sdk_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connector_shopify_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  project_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  queue_name: 'test-env-queue-orders',
  bot_id: 'test-env-bot-reader',
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function successEnvelope(data: unknown): { success: true; data: unknown } {
  return { success: true, data };
}

export function listEnvelope(items: unknown[]): {
  success: true;
  data: {
    items: unknown[];
    pagination: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
  };
} {
  return {
    success: true,
    data: {
      items,
      pagination: {
        page: 1,
        page_size: 20,
        total: items.length,
        total_pages: 1,
        has_next: false,
        has_prev: false,
      },
    },
  };
}

/** GET /organizations/users/me when user_id=me (organizations microservice). */
export function usersMeSuccessResponse(overrides?: {
  email?: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
}): object {
  return successEnvelope({
    user: {
      user_id: MOCK_IDS.user_id,
      email: overrides?.email ?? 'cli-user@test.loxtep.com',
      first_name: overrides?.first_name ?? 'CLI',
      last_name: overrides?.last_name ?? 'User',
      organization_id: MOCK_IDS.organization_id,
      status: 'active',
    },
    organization: {
      organization_id: MOCK_IDS.organization_id,
      name: overrides?.organization_name ?? 'Test Organization',
      status: 'active',
    },
  });
}

/** POST /app/auth/login success envelope. */
export function authLoginSuccessResponse(): object {
  return successEnvelope({
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  });
}

function pathnameFromRequest(input: RequestInfo | URL, apiHost: string): string {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const parsed = new URL(url.startsWith('http') ? url : `${apiHost}${url}`);
  return parsed.pathname + parsed.search;
}

/** Resolve SDK-relative path to the public URL path the HTTP client requests. */
export function resolvedPlatformPath(relativePath: string): string {
  const full = buildPlatformRequestUrl(MOCK_PLATFORM_API, relativePath);
  return full.replace(MOCK_PLATFORM_API, '');
}

type RouteHandler = (pathname: string, init?: RequestInit) => Response | Promise<Response>;

function routeMatch(pathname: string, pattern: RegExp): RegExpMatchArray | null {
  const pathOnly = pathname.split('?')[0] ?? pathname;
  return pathOnly.match(pattern);
}

/**
 * Default mock catalog — covers read-only CLI commands (Phase 3).
 * Match on pathname (+ query) after platform URL resolution.
 */
export function createDefaultPlatformRoutes(): RouteHandler {
  return (pathname: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'POST' && pathname.startsWith(resolvedPlatformPath('/app/auth/login'))) {
      return jsonResponse(authLoginSuccessResponse());
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/organizations/users/me'))) {
      return jsonResponse(usersMeSuccessResponse());
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/organizations/domains'))) {
      const detail = routeMatch(pathname, /\/organizations\/domains\/([^/?]+)$/);
      if (detail) {
        return jsonResponse(
          successEnvelope({
            domain_id: detail[1],
            name: 'Test Domain',
            organization_id: MOCK_IDS.organization_id,
            status: 'active',
          })
        );
      }
      return jsonResponse(
        listEnvelope([
          {
            domain_id: MOCK_IDS.domain_id,
            name: 'Test Domain',
            organization_id: MOCK_IDS.organization_id,
          },
        ])
      );
    }

    if (
      method === 'GET' &&
      routeMatch(pathname, /\/organizations\/instances\/[^/]+\/stream-config$/)
    ) {
      return jsonResponse(
        successEnvelope({
          Region: 'us-east-1',
          LeoEvent: 'test-LeoEvent',
          LeoStream: 'test-LeoStream',
          LeoCron: 'test-LeoCron',
          LeoS3: 'test-LeoS3',
          LeoKinesisStream: 'test-LeoKinesisStream',
          LeoFirehoseStream: 'test-LeoFirehoseStream',
          LeoSettings: 'test-LeoSettings',
        })
      );
    }

    if (method === 'GET' && routeMatch(pathname, /\/instances\/[^/]+\/stream-config$/)) {
      return jsonResponse(
        successEnvelope({
          Region: 'us-east-1',
          LeoEvent: 'test-LeoEvent',
          LeoStream: 'test-LeoStream',
          LeoCron: 'test-LeoCron',
          LeoS3: 'test-LeoS3',
          LeoKinesisStream: 'test-LeoKinesisStream',
          LeoFirehoseStream: 'test-LeoFirehoseStream',
          LeoSettings: 'test-LeoSettings',
        })
      );
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/observe/stream-config'))) {
      return jsonResponse(
        successEnvelope({
          Region: 'us-east-1',
          LeoEvent: 'test-LeoEvent',
          LeoStream: 'test-LeoStream',
          LeoCron: 'test-LeoCron',
          LeoS3: 'test-LeoS3',
          LeoKinesisStream: 'test-LeoKinesisStream',
          LeoFirehoseStream: 'test-LeoFirehoseStream',
          LeoSettings: 'test-LeoSettings',
        })
      );
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/organizations/instances'))) {
      const detail = routeMatch(pathname, /\/organizations\/instances\/([^/?]+)$/);
      if (detail) {
        return jsonResponse(
          successEnvelope({
            instance_id: detail[1],
            name: 'Test Instance',
            organization_id: MOCK_IDS.organization_id,
            region: 'us-east-1',
            status: 'active',
            api_url: MOCK_PLATFORM_API,
            stack_id: 'stack-test',
            connection_details: {},
            metadata: { instance_type: 'shared' },
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          })
        );
      }
      return jsonResponse(
        listEnvelope([
          {
            instance_id: MOCK_IDS.instance_id,
            name: 'Test Instance',
            organization_id: MOCK_IDS.organization_id,
            region: 'us-east-1',
            status: 'active',
            api_url: MOCK_PLATFORM_API,
          },
        ])
      );
    }

    if (
      method === 'GET' &&
      routeMatch(pathname, /\/organizations\/[^/]+\/deployment-urls$/)
    ) {
      return jsonResponse(
        successEnvelope({
          external_id: 'ext-test-001',
          cloudformation_url: 'https://console.aws.amazon.com/cloudformation/home',
          terraform_snippet: 'module "loxtep" {}',
        })
      );
    }

    if (
      method === 'GET' &&
      routeMatch(pathname, /\/organizations\/[^/]+\/infrastructure$/)
    ) {
      return jsonResponse(
        successEnvelope({
          cross_account_role_arn: null,
          external_id: 'ext-test-001',
          preferred_region: 'us-east-1',
          infrastructure_registered_at: null,
        })
      );
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/governance/standards'))) {
      const detail = routeMatch(pathname, /\/governance\/standards\/([^/?]+)$/);
      if (detail) {
        return jsonResponse(
          successEnvelope({
            standard_id: detail[1],
            name: 'PII Handling',
            status: 'active',
          })
        );
      }
      return jsonResponse(
        listEnvelope([
          { standard_id: MOCK_IDS.standard_id, name: 'PII Handling', status: 'active' },
        ])
      );
    }

    if (method === 'GET' && pathname.startsWith('/dataproducts/datacontracts')) {
      const detail = routeMatch(pathname, /\/dataproducts\/datacontracts\/([^/?]+)$/);
      if (detail) {
        return jsonResponse(
          successEnvelope({
            contract_id: detail[1],
            name: 'Orders SLA',
            data_product_id: MOCK_IDS.data_product_id,
            status: 'active',
          })
        );
      }
      return jsonResponse(
        listEnvelope([
          {
            contract_id: MOCK_IDS.contract_id,
            name: 'Orders SLA',
            data_product_id: MOCK_IDS.data_product_id,
          },
        ])
      );
    }

    // JWT warehouse analytics (SDK query / list_tables) — must run before /dataproducts/dataproducts catch-all
    if (method === 'GET' && pathname.includes('/warehouse/tables')) {
      return jsonResponse({
        tables: [
          {
            name: 'orders',
            sql_name: 'orders',
            data_product_id: MOCK_IDS.data_product_id,
            medallion: 'bronze',
          },
        ],
        count: 1,
      });
    }
    if (method === 'POST' && pathname.includes('/warehouse/execute')) {
      return jsonResponse({
        status: 'completed',
        columns: ['id'],
        rows: [{ id: 'order-1' }],
        row_count: 1,
        total_count: 1,
        execution_time_ms: 5,
      });
    }

    if (method === 'GET' && pathname.startsWith('/dataproducts/dataproducts')) {
      const tables = routeMatch(pathname, /\/dataproducts\/dataproducts\/([^/?]+)\/tables$/);
      if (tables) {
        return jsonResponse(successEnvelope({ items: [{ name: 'orders', columns: ['id'] }] }));
      }
      const detail = routeMatch(pathname, /\/dataproducts\/dataproducts\/([^/?]+)$/);
      if (detail && detail[1] !== 'datacontracts' && detail[1] !== 'query' && detail[1] !== 'warehouse') {
        return jsonResponse(
          successEnvelope({
            data_product_id: detail[1],
            name: 'Orders',
            organization_id: MOCK_IDS.organization_id,
            project_id: MOCK_IDS.project_id,
            status: 'active',
            storage: { rstreams_queue: MOCK_IDS.queue_name },
            deployment_bindings: {
              instance_id: MOCK_IDS.instance_id,
              deployment_id: 'deploy-test-001',
              bot_id: MOCK_IDS.bot_id,
              queue_name: MOCK_IDS.queue_name,
            },
          })
        );
      }
      if (
        pathname === '/dataproducts/dataproducts' ||
        pathname.startsWith('/dataproducts/dataproducts?')
      ) {
        return jsonResponse(
          listEnvelope([
            {
              data_product_id: MOCK_IDS.data_product_id,
              name: 'Orders',
              status: 'active',
            },
          ])
        );
      }
    }

    // Project entities (triggers/targets connections)
    if (method === 'GET' && /\/workflows\/projects\/[^/]+\/entities$/.test(pathname)) {
      return jsonResponse(
        successEnvelope({
          connections: [
            {
              connection_id: MOCK_IDS.trigger_id,
              name: 'Shopify',
              type: 'api',
              status: 'active',
              key: 'shopify',
              data: '{}',
              configuration: {},
              metadata: {},
              verified: false,
              draft: false,
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          ],
          workflows: [],
          domains: [],
          transformations: [],
          validations: [],
          data_products: [],
          schemas: [],
          contracts: [],
          quality_rules: [],
          exports: [],
        })
      );
    }
    if (
      (method === 'GET' || method === 'PUT' || method === 'DELETE') &&
      /\/workflows\/projects\/[^/]+\/entities\/connections\//.test(pathname)
    ) {
      const idMatch = pathname.match(/\/connections\/([^/?]+)/);
      const connectionId = idMatch?.[1] ?? MOCK_IDS.trigger_id;
      if (method === 'DELETE') {
        return jsonResponse(successEnvelope({ deleted: true }));
      }
      let body: Record<string, unknown> = {};
      if (method === 'PUT' && init?.body) {
        try {
          body = JSON.parse(String(init.body));
        } catch {
          body = {};
        }
      }
      return jsonResponse(
        successEnvelope({
          connection_id: method === 'PUT' ? 'trigger-created-001' : connectionId,
          name: (body.name as string) ?? 'Shopify',
          type: (body.type as string) ?? 'api',
          status: 'active',
          key: (body.key as string) ?? 'shopify',
          data: '{}',
          configuration: {},
          metadata: {},
          verified: false,
          draft: false,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        })
      );
    }

    if (method === 'POST' && pathname.startsWith('/dataproducts/dataproducts/query')) {
      return jsonResponse(
        successEnvelope({
          items: [{ id: 1, name: 'order-1' }],
          metadata: { data_product_id: MOCK_IDS.data_product_id },
        })
      );
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/workflows/workflows'))) {
      const nodes = routeMatch(pathname, /\/workflows\/workflows\/([^/?]+)\/nodes$/);
      if (nodes) {
        return jsonResponse(listEnvelope([]));
      }
      const detail = routeMatch(pathname, /\/workflows\/workflows\/([^/?]+)$/);
      if (detail) {
        return jsonResponse(
          successEnvelope({
            workflow_id: detail[1],
            name: 'Ingest Orders',
            project_id: MOCK_IDS.project_id,
            status: 'active',
          })
        );
      }
      return jsonResponse(
        listEnvelope([
          {
            workflow_id: MOCK_IDS.workflow_id,
            name: 'Ingest Orders',
            project_id: MOCK_IDS.project_id,
            status: 'active',
          },
        ])
      );
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/workflows/connections'))) {
      const detail = routeMatch(pathname, /\/workflows\/connections\/([^/?]+)$/);
      if (detail) {
        return jsonResponse(
          successEnvelope({
            connection_id: detail[1],
            name: 'Shopify',
            type: 'api',
            status: 'active',
          })
        );
      }
      return jsonResponse(
        listEnvelope([
          {
            connection_id: MOCK_IDS.trigger_id,
            name: 'Shopify',
            type: 'api',
            status: 'active',
          },
        ])
      );
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/observe/bots'))) {
      return jsonResponse(
        successEnvelope({
          bots: [{ bot_id: MOCK_IDS.bot_id, status: 'active' }],
          queues: [{ queue_name: MOCK_IDS.queue_name }],
        })
      );
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/observe/queues'))) {
      if (pathname.includes('/checkpoint')) {
        return jsonResponse({
          queue_name: MOCK_IDS.queue_name,
          bot_id: MOCK_IDS.bot_id,
          checkpoint: '0',
        });
      }
      return jsonResponse(
        successEnvelope({
          queues: [
            {
              queue_name: MOCK_IDS.queue_name,
              name: MOCK_IDS.queue_name,
              checkpoints: [],
              readers: [],
              writers: [],
              stats: {},
            },
          ],
        })
      );
    }

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/rate-limits'))) {
      return jsonResponse({
        limit: 1000,
        remaining: 999,
        reset_at: new Date(Date.now() + 60_000).toISOString(),
      });
    }

    if (method === 'GET' && pathname.startsWith('/ai/activity')) {
      return jsonResponse(
        successEnvelope({
          entries: [
            {
              entry_id: 'act-001',
              source: 'cli',
              actor: MOCK_IDS.user_id,
              resource_type: 'workflow',
              timestamp: new Date().toISOString(),
            },
          ],
          cursor: null,
        })
      );
    }

    if (method === 'GET' && pathname.startsWith('/ai/improvements')) {
      return jsonResponse(
        successEnvelope({
          improvements: [
            {
              id: 'imp-001',
              status: 'proposed',
              workflow_name: 'orders-enricher',
              rationale: 'Add validation',
              proposed_change: 'export default { name: "orders-enricher" };',
              created_at: new Date().toISOString(),
            },
          ],
          cursor: null,
        })
      );
    }

    if (method === 'POST' && pathname.startsWith('/ai/improvements')) {
      let body: { id?: string; action?: string } = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      const status = body.action === 'reject' ? 'rejected' : 'applied';
      return jsonResponse(
        successEnvelope({
          id: body.id ?? 'imp-001',
          status,
          updated_at: new Date().toISOString(),
        })
      );
    }

    if (method === 'GET' && pathname.startsWith('/connectors/connectors')) {
      const detail = routeMatch(pathname, /\/connectors\/connectors\/([^/?]+)$/);
      if (detail) {
        const connectorId = detail[1];
        if (connectorId === MOCK_IDS.connector_sdk_id || connectorId === 'connector-sdk-001') {
          return jsonResponse(
            successEnvelope({
              connector_id: MOCK_IDS.connector_sdk_id,
              connector_type: 'sdk',
              metadata: { name: 'SDK Connector', instance_id: MOCK_IDS.instance_id },
              organization_id: MOCK_IDS.organization_id,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            })
          );
        }
        return jsonResponse(
          successEnvelope({
            connector_id: connectorId,
            connector_type: 'shopify',
            metadata: { name: 'Shopify' },
            organization_id: MOCK_IDS.organization_id,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          })
        );
      }

      const qs = pathname.includes('?') ? pathname.slice(pathname.indexOf('?')) : '';
      const connectorType = new URLSearchParams(qs).get('connector_type');

      const shopify = {
        connector_id: MOCK_IDS.connector_shopify_id,
        connector_type: 'shopify',
        metadata: { name: 'Shopify' },
        organization_id: MOCK_IDS.organization_id,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      const sdk = {
        connector_id: MOCK_IDS.connector_sdk_id,
        connector_type: 'sdk',
        metadata: { name: 'SDK Connector', instance_id: MOCK_IDS.instance_id },
        organization_id: MOCK_IDS.organization_id,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };

      const items =
        connectorType === 'sdk' ? [sdk] : connectorType === 'shopify' ? [shopify] : [shopify, sdk];

      return jsonResponse(listEnvelope(items));
    }

    if (method === 'POST' && (pathname === '/connectors/connectors' || pathname.startsWith('/connectors/connectors?'))) {
      let body: Record<string, unknown> = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      return jsonResponse(
        successEnvelope({
          connector_id: MOCK_IDS.connector_sdk_id,
          connector_type: body.connector_type ?? 'sdk',
          metadata: body.metadata ?? { name: 'SDK Connector' },
          organization_id: MOCK_IDS.organization_id,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          status: 'active',
        })
      );
    }

    if (method === 'GET' && pathname.startsWith('/dataproducts/templates')) {
      const detail = routeMatch(pathname, /\/dataproducts\/templates\/([^/?]+)$/);
      if (detail) {
        return jsonResponse(
          successEnvelope({
            template_id: detail[1],
            name: detail[1],
            description: 'Test template',
            category: 'ingestion',
            version: '1.0.0',
            configuration: {},
            validation_rules: {},
            metadata: { slug: detail[1] },
            is_public: true,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        );
      }
      return jsonResponse(
        listEnvelope([
          {
            template_id: 'template-test-001',
            name: 'commerce-mesh',
            description: 'Commerce template',
            category: 'ingestion',
            version: '1.0.0',
            configuration: {},
            validation_rules: {},
            metadata: { slug: 'commerce-mesh' },
            is_public: true,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
      );
    }

    if (method === 'POST' && pathname === '/dataproducts/dataproducts') {
      let body: Record<string, unknown> = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      return jsonResponse(
        successEnvelope({
          data_product_id: 'dp-created-001',
          name: body.name ?? 'New Data Product',
          organization_id: MOCK_IDS.organization_id,
          status: 'draft',
          kind: body.kind ?? 'source',
        })
      );
    }

    if (method === 'POST' && pathname === '/dataproducts/datacontracts') {
      let body: Record<string, unknown> = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      return jsonResponse(
        successEnvelope({
          contract_id: 'contract-created-001',
          name: body.name ?? 'New Contract',
          data_product_id: body.data_product_id ?? MOCK_IDS.data_product_id,
          status: 'draft',
        })
      );
    }

    if (method === 'GET' && pathname.startsWith('/graph/promotions/')) {
      const readiness = routeMatch(pathname, /\/graph\/promotions\/([^/?]+)\/readiness$/);
      if (readiness) {
        return jsonResponse(
          successEnvelope({
            data_product_id: readiness[1],
            current_tier: 'bronze',
            target_tier: 'silver',
            promotable: true,
            progress_percent: 100,
            prerequisites: [],
          })
        );
      }
    }

    if (method === 'POST' && pathname.startsWith('/graph/promotions/')) {
      const promote = routeMatch(pathname, /\/graph\/promotions\/([^/?]+)\/promote$/);
      if (promote) {
        return jsonResponse(
          successEnvelope({
            success: true,
            new_tier: 'silver',
            entity_iris: ['iri:test:orders'],
          })
        );
      }
    }

    if (method === 'POST' && pathname.startsWith(resolvedPlatformPath('/workflows/workflows'))) {
      let body: Record<string, unknown> = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      return jsonResponse(
        successEnvelope({
          workflow_id: 'wf-created-001',
          name: body.name ?? 'New Workflow',
          project_id: body.project_id ?? MOCK_IDS.project_id,
          status: 'inactive',
        })
      );
    }

    if (method === 'POST' && routeMatch(pathname, /\/workflows\/projects\/[^/]+\/workflow-bundle$/)) {
      let body: Record<string, unknown> = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      const files = (body.files as Record<string, unknown>) ?? {};
      const workflowJson = files['workflow.json'] as Record<string, unknown> | undefined;
      const workflowId =
        typeof workflowJson?.workflow_id === 'string' ? workflowJson.workflow_id : 'wf-bundle-001';
      return jsonResponse(
        successEnvelope({
          success: true,
          dry_run: body.dry_run === true,
          workflow_id: workflowId,
          created_entities: [
            {
              entity_type: 'workflow',
              entity_id: workflowId,
              path: `workflows/${workflowId}/workflow.json`,
            },
          ],
        })
      );
    }

    if (method === 'POST' && routeMatch(pathname, /\/workflows\/projects\/[^/]+\/deploy$/)) {
      return jsonResponse(
        successEnvelope({
          deployment_id: 'deploy-test-001',
          status: 'in_progress',
          project_id: MOCK_IDS.project_id,
          instance_id: MOCK_IDS.instance_id,
        })
      );
    }

    if (method === 'POST' && pathname.startsWith(resolvedPlatformPath('/workflows/projects'))) {
      let body: Record<string, unknown> = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      return jsonResponse(
        successEnvelope({
          project_id: 'project-created-001',
          name: body.name ?? 'New Project',
          organization_id: MOCK_IDS.organization_id,
          status: 'active',
        })
      );
    }

    if (
      method === 'GET' &&
      (pathname === resolvedPlatformPath('/workflows/projects') ||
        pathname.startsWith(`${resolvedPlatformPath('/workflows/projects')}?`))
    ) {
      return jsonResponse(
        listEnvelope([
          {
            project_id: MOCK_IDS.project_id,
            name: 'Test Project',
            organization_id: MOCK_IDS.organization_id,
            status: 'active',
          },
        ])
      );
    }

    if (method === 'GET' && routeMatch(pathname, /\/workflows\/projects\/[^/?]+$/)) {
      const detail = routeMatch(pathname, /\/workflows\/projects\/([^/?]+)$/);
      if (detail) {
        return jsonResponse(
          successEnvelope({
            project_id: detail[1],
            name: 'Test Project',
            organization_id: MOCK_IDS.organization_id,
            github_repo_url: 'https://github.com/test/org-repo',
            github_repo_name: 'org-repo',
            github_branch: 'main',
            status: 'active',
          })
        );
      }
    }

    if (method === 'DELETE' && routeMatch(pathname, /\/workflows\/projects\/[^/?]+$/)) {
      const detail = routeMatch(pathname, /\/workflows\/projects\/([^/?]+)$/);
      return jsonResponse(
        successEnvelope({
          project_id: detail?.[1] ?? 'unknown',
          deleted: true,
        })
      );
    }

    if (method === 'POST' && pathname.startsWith(resolvedPlatformPath('/organizations/instances'))) {
      let body: Record<string, unknown> = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      return jsonResponse(
        successEnvelope({
          instance_id: 'instance-created-001',
          correlation_id: 'corr-test-001',
          message: 'Instance creation queued',
          instance: {
            instance_id: 'instance-created-001',
            name: body.name ?? 'New Instance',
            organization_id: MOCK_IDS.organization_id,
            region: body.region ?? 'us-east-1',
            status: 'pending',
          },
        })
      );
    }

    if (
      method === 'PUT' &&
      routeMatch(pathname, /\/organizations\/organizations\/[^/]+\/infrastructure$/)
    ) {
      let body: Record<string, unknown> = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      return jsonResponse(
        successEnvelope({
          organization_id: MOCK_IDS.organization_id,
          cross_account_role_arn: body.cross_account_role_arn ?? 'arn:aws:iam::123:role/test',
          external_id: 'ext-test-001',
          region: body.region ?? 'us-east-1',
          registered_at: new Date().toISOString(),
        })
      );
    }

    if (method === 'POST' && pathname.startsWith(resolvedPlatformPath('/workflows/connections'))) {
      const testMatch = routeMatch(pathname, /\/workflows\/connections\/([^/?]+)\/test$/);
      if (testMatch) {
        return jsonResponse(
          successEnvelope({
            connection_id: testMatch[1],
            success: true,
            message: 'Connection test succeeded',
          })
        );
      }
      let body: Record<string, unknown> = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      return jsonResponse(
        successEnvelope({
          connection_id: 'trigger-created-001',
          name: body.name ?? 'New Trigger',
          type: body.type ?? 'api',
          key: body.key ?? 'new-trigger',
          status: 'active',
        })
      );
    }

    return jsonResponse(
      { success: false, message: 'Unhandled mock route', method, pathname },
      404
    );
  };
}

/**
 * fetch mock that routes by resolved platform pathname.
 * Optional `extra` handlers run first (return null to fall through).
 */
export function createPlatformMockFetch(options?: {
  apiHost?: string;
  extra?: RouteHandler;
}): typeof fetch {
  const apiHost = options?.apiHost ?? MOCK_PLATFORM_API;
  const defaultRoute = createDefaultPlatformRoutes();

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const pathname = pathnameFromRequest(input, apiHost);
    if (options?.extra) {
      const extraRes = await options.extra(pathname, init);
      if (extraRes.status !== 404) return extraRes;
    }
    return defaultRoute(pathname, init);
  }) as typeof fetch;
}

/** @deprecated Prefer {@link createPlatformMockFetch} for full CLI integration tests. */
export function createMockPlatformFetch(
  responses: Map<string, () => Response>,
  apiHost: string = MOCK_PLATFORM_API
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const pathname = pathnameFromRequest(input, apiHost);
    const pathOnly = pathname.split('?')[0] ?? pathname;
    const handler =
      responses.get(pathname) ?? responses.get(pathOnly) ?? responses.get('*');
    if (handler) return handler();
    return jsonResponse({ success: false, message: 'Not Found', path: pathname }, 404);
  }) as typeof fetch;
}

/** Standard auth + session handlers for login → whoami flows. */
export function createAuthFlowMockFetch(apiHost: string = MOCK_PLATFORM_API): typeof fetch {
  return createPlatformMockFetch({ apiHost });
}
