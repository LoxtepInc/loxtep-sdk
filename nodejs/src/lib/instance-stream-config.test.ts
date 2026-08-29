import type { Instance } from '../client/instances-types.js';
import type { LoxtepHttpClient } from '../http/client.js';
import {
  extractStreamConfigFromInstance,
  fetchInstanceStreamConfig,
  instanceStreamConfigToStreams,
  isCompleteStreamConfig,
} from './instance-stream-config.js';

const FULL = {
  Region: 'us-east-1',
  LeoEvent: 'prod-LeoEvent',
  LeoStream: 'prod-LeoStream',
  LeoCron: 'prod-LeoCron',
  LeoS3: 'prod-LeoS3',
  LeoKinesisStream: 'prod-LeoKinesis',
  LeoFirehoseStream: 'prod-LeoFirehose',
  LeoSettings: 'prod-LeoSettings',
};

function baseInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    instance_id: 'inst_1',
    organization_id: 'org_1',
    name: 'test',
    api_url: 'https://api.test.io',
    region: 'us-west-2',
    stack_id: 'stack_1',
    status: 'active',
    connection_details: {},
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('instanceStreamConfigToStreams', () => {
  it('maps API stream-config fields to ConfigurationResources', () => {
    const streams = instanceStreamConfigToStreams(FULL);
    expect(streams).toEqual(FULL);
  });
});

describe('isCompleteStreamConfig', () => {
  it('returns true when all required keys are present', () => {
    expect(isCompleteStreamConfig(FULL)).toBe(true);
  });

  it('returns false when any required key is missing', () => {
    expect(isCompleteStreamConfig({ Region: 'us-east-1', LeoEvent: 'e' })).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isCompleteStreamConfig(undefined)).toBe(false);
  });
});

describe('extractStreamConfigFromInstance', () => {
  it('reads complete rstreams from metadata object', () => {
    const cfg = extractStreamConfigFromInstance(
      baseInstance({ metadata: { rstreams: { ...FULL, Region: undefined } } })
    );
    expect(cfg?.Region).toBe('us-west-2');
    expect(cfg?.LeoEvent).toBe(FULL.LeoEvent);
  });

  it('parses metadata when stored as JSON string', () => {
    const cfg = extractStreamConfigFromInstance(
      baseInstance({ metadata: JSON.stringify({ rstreams: FULL }) as unknown as Instance['metadata'] })
    );
    expect(cfg).toEqual(FULL);
  });

  it('reads rstreams from connection_details.observe_api', () => {
    const cfg = extractStreamConfigFromInstance(
      baseInstance({
        metadata: {},
        connection_details: { observe_api: { rstreams: FULL } },
      })
    );
    expect(cfg).toEqual(FULL);
  });

  it('reads top-level connection_details.rstreams', () => {
    const cfg = extractStreamConfigFromInstance(
      baseInstance({
        metadata: {},
        connection_details: { rstreams: FULL },
      })
    );
    expect(cfg?.LeoStream).toBe(FULL.LeoStream);
  });

  it('returns null when rstreams is incomplete', () => {
    expect(
      extractStreamConfigFromInstance(
        baseInstance({ metadata: { rstreams: { Region: 'us-east-1', LeoEvent: 'e' } } })
      )
    ).toBeNull();
  });

  it('returns null when metadata JSON is invalid or non-object', () => {
    expect(
      extractStreamConfigFromInstance(
        baseInstance({ metadata: 'not-json' as unknown as Instance['metadata'] })
      )
    ).toBeNull();
    expect(
      extractStreamConfigFromInstance(
        baseInstance({ metadata: JSON.stringify([1, 2]) as unknown as Instance['metadata'] })
      )
    ).toBeNull();
  });

  it('returns null when no embedded config exists', () => {
    expect(extractStreamConfigFromInstance(baseInstance())).toBeNull();
  });
});

describe('fetchInstanceStreamConfig missing keys', () => {
  it('throws when organizations response lacks required Leo names', async () => {
    const http = {
      get: async () => ({ success: true, data: { Region: 'us-east-1', LeoEvent: 'only' } }),
    } as unknown as LoxtepHttpClient;

    await expect(fetchInstanceStreamConfig(http, 'inst-1')).rejects.toThrow(
      /missing required Leo resource names/
    );
  });
});
