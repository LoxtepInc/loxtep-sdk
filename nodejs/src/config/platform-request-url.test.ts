import { buildPlatformRequestUrl, getGatewayMicroserviceId } from './platform-request-url.js';

describe('getGatewayMicroserviceId', () => {
  it('maps first path segment before overrides', () => {
    expect(getGatewayMicroserviceId('/workflows/x')).toBe('workflows');
    expect(getGatewayMicroserviceId('/dataproducts')).toBe('dataproducts');
  });
});

describe('buildPlatformRequestUrl', () => {
  const host = 'https://apidev.example.com';

  it('prefixes dataproducts paths with the dataproducts microservice', () => {
    expect(buildPlatformRequestUrl(host, '/dataproducts')).toBe(
      'https://apidev.example.com/dataproducts/dataproducts'
    );
  });

  it('does not double-prefix when the path already has the microservice and more segments', () => {
    expect(buildPlatformRequestUrl(host, '/workflows/projects')).toBe(
      'https://apidev.example.com/workflows/projects'
    );
  });

  it('does not double-prefix /ai and /graph', () => {
    expect(buildPlatformRequestUrl(host, '/ai/mcp/x')).toBe('https://apidev.example.com/ai/mcp/x');
    expect(buildPlatformRequestUrl(host, '/graph/organizations/x')).toBe(
      'https://apidev.example.com/graph/organizations/x'
    );
  });

  it('routes observe and rate-limits through app', () => {
    expect(buildPlatformRequestUrl(host, '/observe/bots')).toBe(
      'https://apidev.example.com/app/observe/bots'
    );
    expect(buildPlatformRequestUrl(host, '/rate-limits')).toBe(
      'https://apidev.example.com/app/rate-limits'
    );
  });

  it('maps /search via LOXTEP_PLATFORM_SEARCH_MS (default graph)', () => {
    const prev = process.env.LOXTEP_PLATFORM_SEARCH_MS;
    try {
      delete process.env.LOXTEP_PLATFORM_SEARCH_MS;
      expect(buildPlatformRequestUrl(host, '/search')).toBe(
        'https://apidev.example.com/graph/search'
      );
      process.env.LOXTEP_PLATFORM_SEARCH_MS = 'search';
      expect(buildPlatformRequestUrl(host, '/search')).toBe(
        'https://apidev.example.com/search/search'
      );
    } finally {
      if (prev !== undefined) process.env.LOXTEP_PLATFORM_SEARCH_MS = prev;
      else delete process.env.LOXTEP_PLATFORM_SEARCH_MS;
    }
  });

  it('routes organizations instance APIs without duplicating the microservice prefix', () => {
    expect(
      buildPlatformRequestUrl(host, '/organizations/instances/abc/stream-config')
    ).toBe('https://apidev.example.com/organizations/instances/abc/stream-config');
  });

  it('does not treat bare /instances as organizations (wrong attach URL would 403)', () => {
    expect(buildPlatformRequestUrl(host, '/instances/abc/stream-config')).toBe(
      'https://apidev.example.com/instances/abc/stream-config'
    );
  });
});
