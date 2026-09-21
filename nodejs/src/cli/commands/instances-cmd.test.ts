/**
 * Tests for `loxtep instances` CLI command — focuses on the pure arg-parsing
 * helpers. The SDK passthrough wrappers
 * (runInstancesList/Get/Create/DeploymentUrls/Registration/Register) are thin
 * and covered by SDK client tests; here we lock the CLI input contract.
 */

import {
  parseCreateInstanceArgs,
  parseUpdateInstanceArgs,
  resolveStreamConfigInstanceId,
} from "./instances-cmd";
import type { InstanceCreateInput } from "../../client/instances-types";

describe("resolveStreamConfigInstanceId", () => {
  it("prefers an explicit instance id", () => {
    expect(
      resolveStreamConfigInstanceId(" inst-explicit ", "inst-attached"),
    ).toBe("inst-explicit");
  });

  it("falls back to the attached workspace instance", () => {
    expect(resolveStreamConfigInstanceId(undefined, " inst-attached ")).toBe(
      "inst-attached",
    );
  });

  it("rejects missing ids with usage text", () => {
    expect(() => resolveStreamConfigInstanceId(undefined, undefined)).toThrow(
      /loxtep instances stream-config/,
    );
    expect(() => resolveStreamConfigInstanceId("  ", "")).toThrow(
      /LOXTEP_INSTANCE_ID/,
    );
  });
});

describe("parseCreateInstanceArgs", () => {
  it("accepts shared playground minimum", () => {
    const input = parseCreateInstanceArgs([
      "--name",
      "Play",
      "--region",
      "us-east-1",
      "--type",
      "shared",
    ]);
    expect(input).toEqual({
      name: "Play",
      region: "us-east-1",
      instance_type: "shared",
    });
    expect(input.payment_method_id).toBeUndefined();
    expect(input.connection_details).toBeUndefined();
  });

  it("accepts managed with plan + payment", () => {
    const input = parseCreateInstanceArgs([
      "--name",
      "Prod",
      "--region",
      "us-east-1",
      "--type",
      "managed",
      "--plan-id",
      "pro",
      "--payment-method-id",
      "550e8400-e29b-41d4-a716-446655440001",
    ]) as Required<InstanceCreateInput>;
    expect(input.plan_id).toBe("pro");
    expect(input.payment_method_id).toBe(
      "550e8400-e29b-41d4-a716-446655440001",
    );
  });

  it("rejects managed without plan-id", () => {
    expect(() =>
      parseCreateInstanceArgs([
        "--name",
        "m",
        "--region",
        "us-east-1",
        "--type",
        "managed",
        "--payment-method-id",
        "pm_1",
      ]),
    ).toThrow(/--plan-id is required/);
  });

  it("accepts self-hosted with all three observe_api ARNs", () => {
    const input = parseCreateInstanceArgs([
      "--name",
      "Regulated",
      "--region",
      "eu-west-1",
      "--type",
      "self-hosted",
      "--payment-method-id",
      "pm_1",
      "--cross-account-role-arn",
      "arn:aws:iam::987654321098:role/LoxtepCrossAccountDeploymentRole",
      "--rstreams-secret-arn",
      "arn:aws:secretsmanager:eu-west-1:987654321098:secret:rstreams/resources",
      "--rstreams-auth-arn",
      "arn:aws:secretsmanager:eu-west-1:987654321098:secret:rstreams/auth",
      "--external-id",
      "ext-1",
    ]);
    expect(input.instance_type).toBe("self-hosted");
    expect(input.connection_details?.observe_api).toMatchObject({
      cross_account_role_arn:
        "arn:aws:iam::987654321098:role/LoxtepCrossAccountDeploymentRole",
      rstreams_secret_arn:
        "arn:aws:secretsmanager:eu-west-1:987654321098:secret:rstreams/resources",
      rstreams_auth_arn:
        "arn:aws:secretsmanager:eu-west-1:987654321098:secret:rstreams/auth",
      external_id: "ext-1",
    });
  });

  it("rejects self-hosted without --payment-method-id", () => {
    expect(() =>
      parseCreateInstanceArgs([
        "--name",
        "s",
        "--region",
        "us-east-1",
        "--type",
        "self-hosted",
        "--cross-account-role-arn",
        "arn:aws:iam::1:role/R",
        "--rstreams-secret-arn",
        "sec",
        "--rstreams-auth-arn",
        "auth",
      ]),
    ).toThrow(/payment-method-id is required/);
  });

  it("rejects self-hosted without any of the three observe_api ARNs", () => {
    expect(() =>
      parseCreateInstanceArgs([
        "--name",
        "s",
        "--region",
        "us-east-1",
        "--type",
        "self-hosted",
        "--payment-method-id",
        "pm_1",
        "--cross-account-role-arn",
        "arn:aws:iam::1:role/R",
        // Missing --rstreams-secret-arn and --rstreams-auth-arn
      ]),
    ).toThrow(/self-hosted requires/);
  });

  it("rejects unknown --type", () => {
    expect(() =>
      parseCreateInstanceArgs([
        "--name",
        "x",
        "--region",
        "r",
        "--type",
        "invalid",
      ]),
    ).toThrow(/--type must be one of/);
  });

  it("rejects missing name/region/type", () => {
    expect(() => parseCreateInstanceArgs([])).toThrow(/Usage:/);
  });
});
describe("parseCreateInstanceArgs connector_vpc", () => {
  it("attaches subnet and security group flags", () => {
    const input = parseCreateInstanceArgs([
      "--name",
      "Regulated",
      "--region",
      "us-east-1",
      "--type",
      "self-hosted",
      "--payment-method-id",
      "550e8400-e29b-41d4-a716-446655440001",
      "--cross-account-role-arn",
      "arn:aws:iam::1:role/R",
      "--rstreams-secret-arn",
      "arn:aws:secretsmanager:us-east-1:1:secret:s",
      "--rstreams-auth-arn",
      "arn:aws:secretsmanager:us-east-1:1:secret:a",
      "--subnet-id",
      "subnet-aaaabbbb",
      "--subnet-id-2",
      "subnet-ccccdddd",
      "--security-group-id",
      "sg-eeeeffff",
    ]);
    expect(input.connection_details?.connector_vpc).toEqual({
      subnet_ids: ["subnet-aaaabbbb", "subnet-ccccdddd"],
      security_group_id: "sg-eeeeffff",
    });
  });

  it("rejects partial VPC flags", () => {
    expect(() =>
      parseCreateInstanceArgs([
        "--name",
        "Play",
        "--region",
        "us-east-1",
        "--type",
        "shared",
        "--subnet-id",
        "subnet-aaaabbbb",
      ]),
    ).toThrow(/subnet-id-2/);
  });
});

describe("parseUpdateInstanceArgs", () => {
  it("parses connector_vpc update", () => {
    const { instanceId, input } = parseUpdateInstanceArgs([
      "550e8400-e29b-41d4-a716-446655440010",
      "--subnet-id",
      "subnet-aaaabbbb",
      "--subnet-id-2",
      "subnet-ccccdddd",
      "--security-group-id",
      "sg-eeeeffff",
    ]);
    expect(instanceId).toBe("550e8400-e29b-41d4-a716-446655440010");
    expect(input.connection_details?.connector_vpc).toEqual({
      subnet_ids: ["subnet-aaaabbbb", "subnet-ccccdddd"],
      security_group_id: "sg-eeeeffff",
    });
  });

  it("parses force redeploy", () => {
    const { input } = parseUpdateInstanceArgs([
      "550e8400-e29b-41d4-a716-446655440010",
      "--redeploy-runtimes",
    ]);
    expect(input.force_runtimes_redeploy).toBe(true);
  });

  it("parses clear VPC", () => {
    const { input } = parseUpdateInstanceArgs([
      "550e8400-e29b-41d4-a716-446655440010",
      "--clear-connector-vpc",
    ]);
    expect(input.connection_details?.connector_vpc).toBeNull();
  });
});
