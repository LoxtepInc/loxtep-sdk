import {
  buildInstanceUpdateBody,
  normalizeWritableEnvironmentKey,
} from "./instance-update-body";

describe("normalizeWritableEnvironmentKey", () => {
  it("trims and lowercases open slugs", () => {
    expect(normalizeWritableEnvironmentKey("  Denver-Franchise  ")).toBe(
      "denver-franchise",
    );
  });

  it("aliases staging→stage and production→prod", () => {
    expect(normalizeWritableEnvironmentKey("staging")).toBe("stage");
    expect(normalizeWritableEnvironmentKey("Production")).toBe("prod");
  });

  it("clears empty / null / blank", () => {
    expect(normalizeWritableEnvironmentKey("")).toBeNull();
    expect(normalizeWritableEnvironmentKey("   ")).toBeNull();
    expect(normalizeWritableEnvironmentKey(null)).toBeNull();
    expect(normalizeWritableEnvironmentKey(undefined)).toBeNull();
  });
});

describe("buildInstanceUpdateBody", () => {
  it("maps top-level environment_key into metadata", () => {
    expect(
      buildInstanceUpdateBody({ environment_key: "Stage" }),
    ).toEqual({
      metadata: { environment_key: "stage" },
    });
  });

  it("clears via null / empty", () => {
    expect(buildInstanceUpdateBody({ environment_key: null })).toEqual({
      metadata: { environment_key: null },
    });
    expect(buildInstanceUpdateBody({ environment_key: "" })).toEqual({
      metadata: { environment_key: null },
    });
  });

  it("accepts metadata.environment_key when top-level omitted", () => {
    expect(
      buildInstanceUpdateBody({
        metadata: { environment_key: "denver-franchise", keep: true },
      }),
    ).toEqual({
      metadata: { environment_key: "denver-franchise", keep: true },
    });
  });

  it("lets top-level environment_key win over metadata", () => {
    expect(
      buildInstanceUpdateBody({
        environment_key: "prod",
        metadata: { environment_key: "stage", other: 1 },
      }),
    ).toEqual({
      metadata: { environment_key: "prod", other: 1 },
    });
  });

  it("passes name / connection_details / force through", () => {
    expect(
      buildInstanceUpdateBody({
        name: "Renamed",
        force_runtimes_redeploy: true,
        environment_key: "dev",
      }),
    ).toEqual({
      name: "Renamed",
      force_runtimes_redeploy: true,
      metadata: { environment_key: "dev" },
    });
  });
});
