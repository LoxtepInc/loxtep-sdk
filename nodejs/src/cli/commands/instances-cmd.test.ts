/**
 * Tests for `loxtep instances` CLI command — focuses on the pure arg-parsing
 * helper `parseCreateInstanceArgs`. The SDK passthrough wrappers
 * (runInstancesList/Get/Create/DeploymentUrls/Registration/Register) are thin
 * and covered by SDK client tests; here we lock the CLI input contract.
 */

import { parseCreateInstanceArgs } from './instances-cmd';
import type { InstanceCreateInput } from '../../client/instances-types';

describe('parseCreateInstanceArgs', () => {
  it('accepts shared playground minimum', () => {
    const input = parseCreateInstanceArgs([
      '--name', 'Play',
      '--region', 'us-east-1',
      '--type', 'shared',
    ]);
    expect(input).toEqual({
      name: 'Play',
      region: 'us-east-1',
      instance_type: 'shared',
    });
    expect(input.payment_method_id).toBeUndefined();
    expect(input.connection_details).toBeUndefined();
  });

  it('accepts managed with plan + payment', () => {
    const input = parseCreateInstanceArgs([
      '--name', 'Prod',
      '--region', 'us-east-1',
      '--type', 'managed',
      '--plan-id', 'pro',
      '--payment-method-id', '550e8400-e29b-41d4-a716-446655440001',
    ]) as Required<InstanceCreateInput>;
    expect(input.plan_id).toBe('pro');
    expect(input.payment_method_id).toBe('550e8400-e29b-41d4-a716-446655440001');
  });

  it('rejects managed without plan-id', () => {
    expect(() =>
      parseCreateInstanceArgs([
        '--name', 'm',
        '--region', 'us-east-1',
        '--type', 'managed',
        '--payment-method-id', 'pm_1',
      ])
    ).toThrow(/--plan-id is required/);
  });

  it('accepts self-hosted with all three observe_api ARNs', () => {
    const input = parseCreateInstanceArgs([
      '--name', 'Regulated',
      '--region', 'eu-west-1',
      '--type', 'self-hosted',
      '--payment-method-id', 'pm_1',
      '--cross-account-role-arn', 'arn:aws:iam::987654321098:role/LoxtepCrossAccountDeploymentRole',
      '--rstreams-secret-arn', 'arn:aws:secretsmanager:eu-west-1:987654321098:secret:rstreams/resources',
      '--rstreams-auth-arn', 'arn:aws:secretsmanager:eu-west-1:987654321098:secret:rstreams/auth',
      '--external-id', 'ext-1',
    ]);
    expect(input.instance_type).toBe('self-hosted');
    expect(input.connection_details?.observe_api).toMatchObject({
      cross_account_role_arn: 'arn:aws:iam::987654321098:role/LoxtepCrossAccountDeploymentRole',
      rstreams_secret_arn: 'arn:aws:secretsmanager:eu-west-1:987654321098:secret:rstreams/resources',
      rstreams_auth_arn: 'arn:aws:secretsmanager:eu-west-1:987654321098:secret:rstreams/auth',
      external_id: 'ext-1',
    });
  });

  it('rejects self-hosted without --payment-method-id', () => {
    expect(() =>
      parseCreateInstanceArgs([
        '--name', 's',
        '--region', 'us-east-1',
        '--type', 'self-hosted',
        '--cross-account-role-arn', 'arn:aws:iam::1:role/R',
        '--rstreams-secret-arn', 'sec',
        '--rstreams-auth-arn', 'auth',
      ])
    ).toThrow(/payment-method-id is required/);
  });

  it('rejects self-hosted without any of the three observe_api ARNs', () => {
    expect(() =>
      parseCreateInstanceArgs([
        '--name', 's',
        '--region', 'us-east-1',
        '--type', 'self-hosted',
        '--payment-method-id', 'pm_1',
        '--cross-account-role-arn', 'arn:aws:iam::1:role/R',
        // Missing --rstreams-secret-arn and --rstreams-auth-arn
      ])
    ).toThrow(/self-hosted requires/);
  });

  it('rejects unknown --type', () => {
    expect(() =>
      parseCreateInstanceArgs([
        '--name', 'x',
        '--region', 'r',
        '--type', 'invalid',
      ])
    ).toThrow(/--type must be one of/);
  });

  it('rejects missing name/region/type', () => {
    expect(() => parseCreateInstanceArgs([])).toThrow(/Usage:/);
  });
});