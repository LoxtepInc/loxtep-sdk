import { LoxtepHttpClient } from './client.js';

// Mock signRequest to avoid AWS credentials in tests
jest.mock('./signer.js', () => ({
  signRequest: jest.fn().mockResolvedValue({
    authorization: 'AWS4-HMAC-SHA256 Credential=test/...',
    'x-amz-date': '20250101T000000Z',
    host: 'api.example.com',
    accept: 'application/json',
  }),
}));

describe('LoxtepHttpClient', () => {
  const baseUrl = 'https://api.example.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should attach JWT when get_token returns token', async () => {
    const getToken = jest.fn().mockResolvedValue('jwt-token');
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve('{"data":1}'),
    });
    const client = new LoxtepHttpClient({
      base_url: baseUrl,
      get_token: getToken,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      fetch_fn: fetchFn,
    });
    await client.get('/users/me');
    expect(getToken).toHaveBeenCalled();
    const { signRequest } = await import('./signer.js');
    expect(signRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-jwt-token': 'jwt-token' }),
      })
    );
  });

  it('should resolve URLs with use_platform_path_resolution (shared host)', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve('{}'),
    });
    const client = new LoxtepHttpClient({
      base_url: baseUrl,
      use_platform_path_resolution: true,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: fetchFn,
    });
    await client.get('/dataproducts');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/dataproducts/dataproducts',
      expect.any(Object)
    );
  });

  it('should throw parsed error on 4xx', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'x-request-id': 'req-1' }),
      text: () =>
        Promise.resolve(
          JSON.stringify({
            message: 'Not found',
            resource_type: 'user',
            resource_id: 'u1',
          })
        ),
    });
    const client = new LoxtepHttpClient({
      base_url: baseUrl,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: fetchFn,
    });
    await expect(client.get('/users/u1')).rejects.toMatchObject({
      message: 'Not found',
      status_code: 404,
    });
  });

  it('should call refresh_auth on 401 once and retry when refresh returns true', async () => {
    let calls = 0;
    const refresh_auth = jest.fn().mockResolvedValue(true);
    const getToken = jest.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    const fetchFn = jest.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers(),
          text: () => Promise.resolve('{"message":"Unauthorized"}'),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('{"ok":true}'),
      });
    });
    const client = new LoxtepHttpClient({
      base_url: baseUrl,
      get_token: getToken,
      refresh_auth,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: fetchFn,
    });
    const result = await client.get('/data');
    expect(refresh_auth).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it('should retry on 503', async () => {
    let calls = 0;
    const fetchFn = jest.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          headers: new Headers(),
          text: () => Promise.resolve('{"message":"Service Unavailable"}'),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('{"data":1}'),
      });
    });
    const client = new LoxtepHttpClient({
      base_url: baseUrl,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      fetch_fn: fetchFn,
    });
    const result = await client.get('/data');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: 1 });
  });
});
