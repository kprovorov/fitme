import { routeAuth } from "eve/channels/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import { accountDeletionReset } from "../agent/lib/reset-auth";

const SECRET = "reset-secret-0123456789abcdef0123456789abcdef";

const request = (
  authorization: string | undefined,
  path: string,
  method = "POST"
) =>
  new Request(`http://arnold.test${path}`, {
    headers:
      authorization !== undefined && authorization !== ""
        ? { authorization }
        : {},
    method,
  });

const auth = accountDeletionReset({ secret: () => SECRET });

const resetWith = async (secret: string) =>
  await routeAuth(
    request(`Bearer ${secret}`, "/eve/v1/session/wrun_alice/reset"),
    accountDeletionReset()
  );

describe("account deletion reset authentication", () => {
  it("lets the reset secret reset a session as a service principal", async () => {
    const result = await routeAuth(
      request(`Bearer ${SECRET}`, "/eve/v1/session/wrun_alice/reset"),
      auth
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({
      principalId: "account-deletion",
      principalType: "service",
    });
  });

  it.each([
    ["POST", "/eve/v1/session"],
    ["POST", "/eve/v1/session/wrun_alice"],
    ["GET", "/eve/v1/session/wrun_alice/stream"],
    ["POST", "/eve/v1/session/wrun_alice/clear"],
    ["GET", "/eve/v1/info"],
    ["GET", "/eve/v1/session/wrun_alice/reset"],
  ])("refuses the reset secret on %s %s", async (method, path) => {
    const result = await routeAuth(
      request(`Bearer ${SECRET}`, path, method),
      auth
    );

    expect(result).toMatchObject({ status: 403 });
  });

  it("answers 401 for a wrong secret", async () => {
    const result = await routeAuth(
      request("Bearer not-the-secret", "/eve/v1/session/wrun_alice/reset"),
      auth
    );

    expect(result).toMatchObject({ status: 401 });
  });

  it("accepts nothing when the secret is unset", async () => {
    const unconfigured = accountDeletionReset({ secret: () => undefined });

    const result = await routeAuth(
      request(`Bearer ${SECRET}`, "/eve/v1/session/wrun_alice/reset"),
      unconfigured
    );

    expect(result).toMatchObject({ status: 401 });
  });

  it("accepts nothing when the secret is too short to be one", async () => {
    const weak = accountDeletionReset({ secret: () => "short" });

    const result = await routeAuth(
      request("Bearer short", "/eve/v1/session/wrun_alice/reset"),
      weak
    );

    expect(result).toMatchObject({ status: 401 });
  });
});

describe("accountDeletionReset's secret from the environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts ARNOLD_RESET_SECRET", async () => {
    vi.stubEnv("ARNOLD_RESET_SECRET", SECRET);
    vi.stubEnv("COACH_RESET_SECRET", `old-${SECRET}`);

    await expect(resetWith(SECRET)).resolves.toMatchObject({
      principalId: "account-deletion",
    });
    await expect(resetWith(`old-${SECRET}`)).resolves.toMatchObject({
      status: 401,
    });
  });

  it("ignores the pre-rename COACH_RESET_SECRET", async () => {
    vi.stubEnv("ARNOLD_RESET_SECRET", "");
    vi.stubEnv("COACH_RESET_SECRET", SECRET);

    await expect(resetWith(SECRET)).resolves.toMatchObject({ status: 401 });
  });
});
