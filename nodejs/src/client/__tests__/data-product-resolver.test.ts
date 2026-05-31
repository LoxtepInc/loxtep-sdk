/**
 * Unit tests for DataProductResolver — resolution by UUID, name, caching,
 * invalidation, and error handling.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 6.1, 6.2, 6.3, 6.4, 10.1, 10.2
 */

import { jest } from '@jest/globals';
import { DataProductResolver, AmbiguityError } from '../data-product-resolver';
import { NotFoundError } from '../../errors/resource';
import { StreamingError } from '../../errors/streaming';
import type { LoxtepHttpClient } from '../../http/client';
import type { DataProduct, DataProductsListResponse } from '../data-products-types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Creates a mock LoxtepHttpClient with a configurable get() implementation. */
function mockHttp(
  getImpl?: (path: string) => Promise<unknown>
): { http: LoxtepHttpClient; getCalls: string[] } {
  const getCalls: string[] = [];
  const http = {
    get: jest.fn(async (path: string) => {
      getCalls.push(path);
      if (getImpl) return getImpl(path);
      return {};
    }),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  } as unknown as LoxtepHttpClient;
  return { http, getCalls };
}

/** A fully-deployed data product fixture. */
function makeDataProduct(overrides?: Partial<DataProduct>): DataProduct {
  return {
    data_product_id: '09fa202b-1234-5678-9abc-def012345678',
    organization_id: 'org-1',
    domain_id: 'domain-1',
    name: 'shopify_gql_customer',
    description: 'Shopify customer data product',
    status: 'active',
    owner: { user_id: 'user-1' },
    workflow_id: 'wf-1',
    deployment_bindings: {
      instance_id: '9c5a188a-aaaa-bbbb-cccc-dddddddddddd',
      deployment_id: 'dep-1',
      bot_id: 'wkflow-nodes-connector-abc',
      queue_name: '9c5a188a-queue-conn-out',
      microservice_id: 'ms-1',
    },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as DataProduct;
}

/** A standard stream config fixture. */
const STREAM_CONFIG = {
  Region: 'us-east-1',
  LeoEvent: 'org-BusLeoEvent-123',
  LeoStream: 'org-BusLeoStream-456',
  LeoCron: 'org-BusLeoCron-789',
  LeoS3: 'org-busleos3-abc',
  LeoKinesisStream: 'org-Buskinesis-def',
  LeoFirehoseStream: 'org-fh',
  LeoSettings: 'org-BusLeoSettings-ghi',
};

/* ------------------------------------------------------------------ */
/*  Tests: Resolution by UUID (Requirement 3.1 — direct lookup)       */
/* ------------------------------------------------------------------ */

describe('DataProductResolver — resolve by UUID', () => {
  it('calls GET /dataproducts/{id} directly when input is a UUID', async () => {
    const dp = makeDataProduct();
    const { http, getCalls } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts/09fa202b')) {
        return { success: true, data: dp };
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);
    const result = await resolver.resolve('09fa202b-1234-5678-9abc-def012345678');

    expect(getCalls[0]).toBe('/dataproducts/09fa202b-1234-5678-9abc-def012345678');
    expect(result.dataProduct.data_product_id).toBe('09fa202b-1234-5678-9abc-def012345678');
    expect(result.dataProduct.queue_name).toBe('9c5a188a-queue-conn-out');
    expect(result.dataProduct.bot_id).toBe('wkflow-nodes-connector-abc');
    expect(result.streamConfig).toEqual(STREAM_CONFIG);
  });

  it('resolves stream config from the instance in deployment_bindings', async () => {
    const dp = makeDataProduct();
    const { http, getCalls } = mockHttp(async (path: string) => {
      if (path.includes('/dataproducts/')) {
        return { success: true, data: dp };
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);
    await resolver.resolve('09fa202b-1234-5678-9abc-def012345678');

    // Should call stream-config with the instance_id from deployment_bindings
    expect(getCalls[1]).toBe('/organizations/instances/9c5a188a-aaaa-bbbb-cccc-dddddddddddd/stream-config');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Resolution by name (Requirement 3.2 — search + exact match)*/
/* ------------------------------------------------------------------ */

describe('DataProductResolver — resolve by name', () => {
  it('calls GET /dataproducts?search=name and filters exact match', async () => {
    const dp = makeDataProduct();
    const { http, getCalls } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);
    const result = await resolver.resolve('shopify_gql_customer');

    expect(getCalls[0]).toBe('/dataproducts?search=shopify_gql_customer');
    expect(result.dataProduct.name).toBe('shopify_gql_customer');
    expect(result.dataProduct.queue_name).toBe('9c5a188a-queue-conn-out');
  });

  it('filters by exact name match (ignores partial matches from search)', async () => {
    const exactMatch = makeDataProduct({ name: 'shopify_gql_customer' });
    const partialMatch = makeDataProduct({
      data_product_id: 'other-id',
      name: 'shopify_gql_customer_v2',
    });
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [exactMatch, partialMatch],
            pagination: { page: 1, page_size: 20, total: 2, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);
    const result = await resolver.resolve('shopify_gql_customer');

    // Should pick the exact match, not the partial
    expect(result.dataProduct.data_product_id).toBe('09fa202b-1234-5678-9abc-def012345678');
  });

  it('includes instance_id in search params when clientInstanceId is set', async () => {
    const dp = makeDataProduct();
    const { http, getCalls } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http, 'instance-xyz');
    await resolver.resolve('shopify_gql_customer');

    expect(getCalls[0]).toContain('instance_id=instance-xyz');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Caching (Requirement 6.1, 6.2)                            */
/* ------------------------------------------------------------------ */

describe('DataProductResolver — caching', () => {
  it('returns cached result on second call without making HTTP requests', async () => {
    const dp = makeDataProduct();
    const { http, getCalls } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    // First call — makes HTTP requests
    const result1 = await resolver.resolve('shopify_gql_customer');
    const callsAfterFirst = getCalls.length;

    // Second call — should use cache
    const result2 = await resolver.resolve('shopify_gql_customer');

    expect(getCalls.length).toBe(callsAfterFirst); // No new HTTP calls
    expect(result2).toBe(result1); // Same reference (cached)
  });

  it('caches by both name and ID so either can be used for lookup', async () => {
    const dp = makeDataProduct();
    const { http, getCalls } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    // Resolve by name first
    await resolver.resolve('shopify_gql_customer');
    const callsAfterFirst = getCalls.length;

    // Now resolve by UUID — should hit cache since it was cached by ID too
    const result2 = await resolver.resolve('09fa202b-1234-5678-9abc-def012345678');

    expect(getCalls.length).toBe(callsAfterFirst); // No new HTTP calls
    expect(result2.dataProduct.name).toBe('shopify_gql_customer');
  });

  it('cache key is case-insensitive (lowercase lookup hits cache from name-resolved entry)', async () => {
    const dp = makeDataProduct();
    const { http, getCalls } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    // First resolve by the exact name (lowercase, matching the fixture)
    await resolver.resolve('shopify_gql_customer');
    const callsAfterFirst = getCalls.length;

    // The resolver caches by dp.name.toLowerCase() — so 'SHOPIFY_GQL_CUSTOMER' should hit cache
    // because the cache key is lowercased
    await resolver.resolve('SHOPIFY_GQL_CUSTOMER');
    expect(getCalls.length).toBe(callsAfterFirst);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Cache invalidation (Requirement 6.3, 6.4)                  */
/* ------------------------------------------------------------------ */

describe('DataProductResolver — cache invalidation', () => {
  it('invalidate(name) removes specific cache entry, next call makes HTTP request', async () => {
    const dp = makeDataProduct();
    const { http, getCalls } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    // Populate cache
    await resolver.resolve('shopify_gql_customer');
    const callsAfterFirst = getCalls.length;

    // Invalidate specific entry
    resolver.invalidate('shopify_gql_customer');

    // Next call should make HTTP requests again
    await resolver.resolve('shopify_gql_customer');
    expect(getCalls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('invalidate() with no args clears all cached entries', async () => {
    const dp = makeDataProduct();
    const dp2 = makeDataProduct({
      data_product_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'another_product',
    });
    const { http, getCalls } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?') && path.includes('shopify')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      if (path.startsWith('/dataproducts?') && path.includes('another')) {
        return {
          success: true,
          data: {
            items: [dp2],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      if (path.includes('/stream-config')) {
        return { success: true, data: STREAM_CONFIG };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    // Populate cache with two entries
    await resolver.resolve('shopify_gql_customer');
    await resolver.resolve('another_product');
    const callsAfterBoth = getCalls.length;

    // Clear all
    resolver.invalidate();

    // Both should require fresh HTTP calls
    await resolver.resolve('shopify_gql_customer');
    await resolver.resolve('another_product');
    expect(getCalls.length).toBeGreaterThan(callsAfterBoth);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: NotFoundError (Requirement 3.3, 10.1)                      */
/* ------------------------------------------------------------------ */

describe('DataProductResolver — NotFoundError', () => {
  it('throws NotFoundError when name search returns 0 results', async () => {
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [],
            pagination: { page: 1, page_size: 20, total: 0, total_pages: 0, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    await expect(resolver.resolve('nonexistent_product')).rejects.toThrow(NotFoundError);
  });

  it('NotFoundError includes the searched name and helpful hint', async () => {
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [],
            pagination: { page: 1, page_size: 20, total: 0, total_pages: 0, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    try {
      await resolver.resolve('nonexistent_product');
      fail('Expected NotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      const nfe = err as NotFoundError;
      expect(nfe.message).toContain('nonexistent_product');
      expect(nfe.message).toContain('not found');
      expect(nfe.resource_id).toBe('nonexistent_product');
      expect(nfe.resource_type).toBe('data_product');
      expect(nfe.details?.hint).toBeDefined();
    }
  });

  it('NotFoundError includes instance_id context when clientInstanceId is set', async () => {
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [],
            pagination: { page: 1, page_size: 20, total: 0, total_pages: 0, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      return {};
    });

    const resolver = new DataProductResolver(http, 'my-instance-id');

    try {
      await resolver.resolve('nonexistent_product');
      fail('Expected NotFoundError');
    } catch (err) {
      const nfe = err as NotFoundError;
      expect(nfe.details?.instance_id).toBe('my-instance-id');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: AmbiguityError (Requirement 3.4)                           */
/* ------------------------------------------------------------------ */

describe('DataProductResolver — AmbiguityError', () => {
  it('throws AmbiguityError when multiple data products match the name', async () => {
    const dp1 = makeDataProduct({
      data_product_id: 'id-1',
      deployment_bindings: {
        instance_id: 'instance-a',
        deployment_id: 'dep-1',
        bot_id: 'bot-1',
        queue_name: 'queue-1',
        microservice_id: 'ms-1',
      },
    });
    const dp2 = makeDataProduct({
      data_product_id: 'id-2',
      deployment_bindings: {
        instance_id: 'instance-b',
        deployment_id: 'dep-2',
        bot_id: 'bot-2',
        queue_name: 'queue-2',
        microservice_id: 'ms-2',
      },
    });
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp1, dp2],
            pagination: { page: 1, page_size: 20, total: 2, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    await expect(resolver.resolve('shopify_gql_customer')).rejects.toThrow(AmbiguityError);
  });

  it('AmbiguityError includes the list of matching data product IDs and instances', async () => {
    const dp1 = makeDataProduct({
      data_product_id: 'id-1',
      deployment_bindings: {
        instance_id: 'instance-a',
        deployment_id: 'dep-1',
        bot_id: 'bot-1',
        queue_name: 'queue-1',
        microservice_id: 'ms-1',
      },
    });
    const dp2 = makeDataProduct({
      data_product_id: 'id-2',
      deployment_bindings: {
        instance_id: 'instance-b',
        deployment_id: 'dep-2',
        bot_id: 'bot-2',
        queue_name: 'queue-2',
        microservice_id: 'ms-2',
      },
    });
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp1, dp2],
            pagination: { page: 1, page_size: 20, total: 2, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    try {
      await resolver.resolve('shopify_gql_customer');
      fail('Expected AmbiguityError');
    } catch (err) {
      expect(err).toBeInstanceOf(AmbiguityError);
      const ae = err as AmbiguityError;
      expect(ae.matches).toHaveLength(2);
      expect(ae.matches[0].data_product_id).toBe('id-1');
      expect(ae.matches[0].instance_id).toBe('instance-a');
      expect(ae.matches[1].data_product_id).toBe('id-2');
      expect(ae.matches[1].instance_id).toBe('instance-b');
      expect(ae.message).toContain('Multiple data products');
      expect(ae.message).toContain('shopify_gql_customer');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: StreamingError — not deployed (Requirement 10.2)           */
/* ------------------------------------------------------------------ */

describe('DataProductResolver — StreamingError (not deployed)', () => {
  it('throws StreamingError when data product has no deployment_bindings', async () => {
    const dp = makeDataProduct({ deployment_bindings: undefined });
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    await expect(resolver.resolve('shopify_gql_customer')).rejects.toThrow(StreamingError);
  });

  it('throws StreamingError when deployment_bindings is missing queue_name', async () => {
    const dp = makeDataProduct({
      deployment_bindings: {
        instance_id: 'inst-1',
        deployment_id: 'dep-1',
        bot_id: 'bot-1',
        queue_name: '', // empty
        microservice_id: 'ms-1',
      },
    });
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    await expect(resolver.resolve('shopify_gql_customer')).rejects.toThrow(StreamingError);
  });

  it('StreamingError message includes data product name and deploy hint', async () => {
    const dp = makeDataProduct({ deployment_bindings: undefined });
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts/')) {
        return { success: true, data: dp };
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    try {
      await resolver.resolve('09fa202b-1234-5678-9abc-def012345678');
      fail('Expected StreamingError');
    } catch (err) {
      expect(err).toBeInstanceOf(StreamingError);
      const se = err as StreamingError;
      expect(se.message).toContain('shopify_gql_customer');
      expect(se.message).toContain('not deployed');
      expect(se.details?.hint).toBeDefined();
    }
  });

  it('throws StreamingError when deployment_bindings is missing bot_id', async () => {
    const dp = makeDataProduct({
      deployment_bindings: {
        instance_id: 'inst-1',
        deployment_id: 'dep-1',
        bot_id: '', // empty
        queue_name: 'some-queue',
        microservice_id: 'ms-1',
      },
    });
    const { http } = mockHttp(async (path: string) => {
      if (path.startsWith('/dataproducts?')) {
        return {
          success: true,
          data: {
            items: [dp],
            pagination: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false, has_prev: false },
          },
        } as DataProductsListResponse;
      }
      return {};
    });

    const resolver = new DataProductResolver(http);

    await expect(resolver.resolve('shopify_gql_customer')).rejects.toThrow(StreamingError);
  });
});
