import type { LoxtepHttpClient } from '../http/client.js';
import { LoxtepHttpClient as HttpClient } from '../http/client.js';
import { fetchInstanceStreamConfig } from './instance-stream-config.js';

const FULL_CONFIG = {
  Region: 'us-east-1',
  LeoEvent: 'evt',
  LeoStream: 'str',
  LeoCron: 'cron',
  LeoS3: 's3',
  LeoKinesisStream: 'kin',
  LeoFirehoseStream: 'fh',
  LeoSettings: 'set',
};

function mockHttp(handlers: Record<string, () => unknown>): LoxtepHttpClient {
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const key = `${method} ${new URL(url).pathname}`;
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (key.includes(pattern) || url.includes(pattern)) {
        const body = handler();
        if (body instanceof Error) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { message: body.message, details: { instance_id: 'inst-1' } },
            }),
            { status: 404 }
          );
        }
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
  };

  return new HttpClient({
    base_url: 'https://api.loxtep.io',
    use_platform_path_resolution: true,
    credentials: {
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
    },
    fetch_fn: fetchFn as typeof fetch,
  });
}

describe('fetchInstanceStreamConfig', () => {
  it('calls organizations stream-config and maps the response', async () => {
    const http = mockHttp({
      '/organizations/instances/inst-1/stream-config': () => ({
        success: true,
        data: FULL_CONFIG,
      }),
    });

    const { config, source } = await fetchInstanceStreamConfig(http, 'inst-1');
    expect(source).toBe('organizations');
    expect(config.LeoEvent).toBe('evt');
  });

  it('surfaces platform error.message from nested error envelope', async () => {
    const http = mockHttp({
      '/organizations/instances/inst-1/stream-config': () => {
        throw new Error('Unable to resolve stream configuration for this instance');
      },
    });

    await expect(fetchInstanceStreamConfig(http, 'inst-1')).rejects.toThrow(
      'Unable to resolve stream configuration for this instance'
    );
  });
});
