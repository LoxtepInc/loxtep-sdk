import {
  resolveInstanceType,
  toInstanceListSummary,
} from './instance-list-summary.js';
import type { Instance } from './instances-types.js';

describe('instance list summary', () => {
  const full: Instance = {
    instance_id: 'i-abc',
    organization_id: 'org-secret',
    name: 'Patch Dev',
    api_url: 'https://apidev.loxtep.io',
    region: 'us-east-1',
    stack_id: 'arn:aws:cloudformation:...',
    status: 'active',
    connection_details: {
      instance_type: 'customer',
      observe_api: {
        namespace: 'lxappdev',
        cross_account_role_arn: 'arn:aws:iam::123:role/x',
        rstreams_secret_arn: 'arn:aws:secretsmanager:...',
      },
    },
    metadata: { internal: true },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  };

  it('prunes to connect-oriented fields only', () => {
    expect(toInstanceListSummary(full)).toEqual({
      instance_id: 'i-abc',
      name: 'Patch Dev',
      api_url: 'https://apidev.loxtep.io',
      region: 'us-east-1',
      status: 'active',
      instance_type: 'self-hosted',
    });
  });

  it('prefers metadata.instance_type over connection_details', () => {
    expect(
      resolveInstanceType({
        ...full,
        metadata: { instance_type: 'managed' },
        connection_details: { instance_type: 'shared' },
      })
    ).toBe('managed');
  });

  it('defaults instance_type to shared', () => {
    expect(
      resolveInstanceType({
        ...full,
        metadata: {},
        connection_details: {},
      })
    ).toBe('shared');
  });
});
