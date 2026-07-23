/**
 * Mock Loxtep platform API for CLI integration tests.
 * Responses use production `{ success, data }` envelopes and resolved gateway paths.
 */

import { buildPlatformRequestUrl } from '../../config/platform-request-url.js';

export const MOCK_PLATFORM_API = 'https://api.test.loxtep.com';

/** Stable IDs returned by the default mock catalog. */
export const MOCK_IDS = {
  user_id: 'user-test-001',
  organization_id: 'org-test-001',
  domain_id: 'domain-test-001',
  instance_id: 'instance-test-001',
  data_product_id: 'dp-test-001',
  workflow_id: 'wf-test-001',
  trigger_id: 'trigger-test-001',
  standard_id: 'standard-test-001',
  contract_id: 'contract-test-001',
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

    if (method === 'GET' && pathname.startsWith(resolvedPlatformPath('/organizations/instances'))) {
      const detail = routeMatch(pathname, /\/organizations\/instances\/([^/?]+)$/);
      if (detail) {
        return jsonResponse(
          successEnvelope({
            instance: {
              instance_id: detail[1],
              name: 'Test Instance',
              organization_id: MOCK_IDS.organization_id,
              region: 'us-east-1',
              status: 'active',
              api_url: MOCK_PLATFORM_API,
              metadata: { instance_type: 'shared' },
            },
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

    if (method === 'GET' && pathname.startsWith('/dataproducts/dataproducts/datacontracts')) {
      const detail = routeMatch(pathname, /\/dataproducts\/dataproducts\/datacontracts\/([^/?]+)$/);
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

    if (method === 'GET' && pathname.startsWith('/dataproducts/dataproducts')) {
      const tables = routeMatch(pathname, /\/dataproducts\/dataproducts\/([^/?]+)\/tables$/);
      if (tables) {
        return jsonResponse(successEnvelope({ items: [{ name: 'orders', columns: ['id'] }] }));
      }
      const detail = routeMatch(pathname, /\/dataproducts\/dataproducts\/([^/?]+)$/);
      if (detail && detail[1] !== 'datacontracts' && detail[1] !== 'query') {
        return jsonResponse(
          successEnvelope({
            data_product_id: detail[1],
            name: 'Orders',
            organization_id: MOCK_IDS.organization_id,
            project_id: 'project-test-001',
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
            project_id: 'project-test-001',
            status: 'active',
          })
        );
      }
      return jsonResponse(
        listEnvelope([
          {
            workflow_id: MOCK_IDS.workflow_id,
            name: 'Ingest Orders',
            project_id: 'project-test-001',
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
      return jsonResponse(
        listEnvelope([
          {
            connector_id: 'connector-test-001',
            connector_type: 'shopify',
            metadata: { name: 'Shopify' },
          },
        ])
      );
    }

    if (method === 'GET' && pathname.startsWith('/dataproducts/dataproducts/templates')) {
      const detail = routeMatch(pathname, /\/dataproducts\/dataproducts\/templates\/([^/?]+)$/);
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

    if (method === 'POST' && pathname === '/dataproducts/dataproducts/datacontracts') {
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
          project_id: body.project_id ?? 'project-test-001',
          status: 'inactive',
        })
      );
    }

    if (method === 'POST' && routeMatch(pathname, /\/workflows\/projects\/[^/]+\/deploy$/)) {
      return jsonResponse(
        successEnvelope({
          deployment_id: 'deploy-test-001',
          status: 'in_progress',
          project_id: 'project-test-001',
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
