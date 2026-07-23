import type { Instance } from '../client/instances-types.js';
import { LoxtepHttpClient } from '../http/client.js';
import {
  extractStreamConfigFromInstance,
  fetchInstanceStreamConfig,
} from './instance-stream-config.js';

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
          return new Response(JSON.stringify({ message: body.message }), { status: 404 });
        }
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
  };

  return new LoxtepHttpClient({
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
  it('falls back to observe when organizations stream-config is 404', async () => {
    const http = mockHttp({
      '/organizations/instances/inst-1/stream-config': () => {
        throw new Error('HTTP 404');
      },
      '/observe/stream-config': () => ({ success: true, data: FULL_CONFIG }),
    });

    const { config, source } = await fetchInstanceStreamConfig(http, 'inst-1');
    expect(source).toBe('observe');
    expect(config.LeoEvent).toBe('evt');
  });

  it('uses instance metadata when API endpoints fail', async () => {
    const http = mockHttp({
      'stream-config': () => {
        throw new Error('HTTP 404');
      },
    });

    const instance: Instance = {
      instance_id: 'inst-1',
      organization_id: 'org-1',
      name: 'prod',
      api_url: 'https://x',
      region: 'us-east-1',
      stack_id: 's',
      status: 'active',
      connection_details: {},
      metadata: { rstreams: FULL_CONFIG },
      created_at: '',
      updated_at: '',
    };

    const { config, source } = await fetchInstanceStreamConfig(http, 'inst-1', { instance });
    expect(source).toBe('instance-metadata');
    expect(config.LeoStream).toBe('str');
  });
});

describe('extractStreamConfigFromInstance', () => {
  it('reads metadata.rstreams', () => {
    const instance = {
      region: 'us-west-2',
      metadata: { rstreams: FULL_CONFIG },
      connection_details: {},
    } as Instance;
    expect(extractStreamConfigFromInstance(instance)?.Region).toBe('us-east-1');
  });
});
