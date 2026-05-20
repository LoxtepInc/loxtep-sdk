import { resolveSdkApiPaths } from './resolve-sdk-urls.js';

describe('resolveSdkApiPaths', () => {
  it('defaults auth to /app and uses platform create URL (ms + path)', () => {
    const p = resolveSdkApiPaths({
      api_url: 'https://apidev.example.com',
      auth_path_prefix: undefined,
      api_path_prefix: undefined,
    });
    expect(p.loxtep_url_mode).toBe('platform');
    expect(p.post_auth_login).toBe('https://apidev.example.com/app/auth/login');
    expect(p.post_auth_refresh).toBe('https://apidev.example.com/app/auth/refresh');
    expect(p.loxtep_client_base_url).toBe('https://apidev.example.com');
    expect(p.post_dataproducts_create).toBe('https://apidev.example.com/dataproducts/dataproducts');
    expect(p.get_dataproducts_list).toBe('https://apidev.example.com/dataproducts/dataproducts');
    expect(p.example_endpoints.length).toBeGreaterThan(15);
    const searchRow = p.example_endpoints.find(e => e.sdk_path === '/search');
    expect(searchRow?.resolved_url).toBe('https://apidev.example.com/graph/search');
  });

  it('adds api_path_prefix for legacy LoxtepClient (create = base + /dataproducts)', () => {
    const p = resolveSdkApiPaths({
      api_url: 'https://apidev.example.com',
      auth_path_prefix: undefined,
      api_path_prefix: 'dataproducts',
    });
    expect(p.loxtep_url_mode).toBe('legacy');
    expect(p.post_auth_refresh).toBe('https://apidev.example.com/app/auth/refresh');
    expect(p.loxtep_client_base_url).toBe('https://apidev.example.com/dataproducts');
    expect(p.post_dataproducts_create).toBe('https://apidev.example.com/dataproducts/dataproducts');
    const first = p.example_endpoints[0];
    expect(first?.resolved_url).toBe('https://apidev.example.com/dataproducts/dataproducts');
  });
});
