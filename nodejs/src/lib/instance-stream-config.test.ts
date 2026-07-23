import {
  instanceStreamConfigToStreams,
  isCompleteStreamConfig,
} from './instance-stream-config.js';

describe('instanceStreamConfigToStreams', () => {
  it('maps API stream-config fields to ConfigurationResources', () => {
    const streams = instanceStreamConfigToStreams({
      Region: 'us-east-1',
      LeoEvent: 'prod-LeoEvent',
      LeoStream: 'prod-LeoStream',
      LeoCron: 'prod-LeoCron',
      LeoS3: 'prod-LeoS3',
      LeoKinesisStream: 'prod-LeoKinesis',
      LeoFirehoseStream: 'prod-LeoFirehose',
      LeoSettings: 'prod-LeoSettings',
    });

    expect(streams).toEqual({
      Region: 'us-east-1',
      LeoEvent: 'prod-LeoEvent',
      LeoStream: 'prod-LeoStream',
      LeoCron: 'prod-LeoCron',
      LeoS3: 'prod-LeoS3',
      LeoKinesisStream: 'prod-LeoKinesis',
      LeoFirehoseStream: 'prod-LeoFirehose',
      LeoSettings: 'prod-LeoSettings',
    });
  });
});

describe('isCompleteStreamConfig', () => {
  it('returns true when all required keys are present', () => {
    expect(
      isCompleteStreamConfig({
        Region: 'us-east-1',
        LeoEvent: 'e',
        LeoStream: 's',
        LeoCron: 'c',
        LeoS3: 's3',
        LeoKinesisStream: 'k',
        LeoFirehoseStream: 'f',
        LeoSettings: 'set',
      })
    ).toBe(true);
  });

  it('returns false when any required key is missing', () => {
    expect(
      isCompleteStreamConfig({
        Region: 'us-east-1',
        LeoEvent: 'e',
      })
    ).toBe(false);
  });
});
