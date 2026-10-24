import { routeAuth } from "eve/channels/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountDeletionReset } from "../agent/lib/reset-auth";

const SECRET = "reset-secret-0123456789abcdef0123456789abcdef";

const request = (
  authorization: string | undefined,
  path: string,
  method = "POST"
) =>
  new Request(`http://coach.test${path}`, {
    headers: authorization ? { authorization } : {},
    method,
  });

const auth = accountDeletionReset({ secret: () => SECRET });

describe("accountDeletionReset", () => {
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

    expect((result as Response).status).toBe(403);
  });

  it("answers 401 for a wrong secret", async () => {
    const result = await routeAuth(
      request("Bearer not-the-secret", "/eve/v1/session/wrun_alice/reset"),
      auth
    );

    expect((result as Response).status).toBe(401);
  });

  it("accepts nothing when the secret is unset", async () => {
    const unconfigured = accountDeletionReset({ secret: () => undefined });

    const result = await routeAuth(
      request(`Bearer ${SECRET}`, "/eve/v1/session/wrun_alice/reset"),
      unconfigured
    );

    expect((result as Response).status).toBe(401);
  });

  it("accepts nothing when the secret is too short to be one", async () => {
    const weak = accountDeletionReset({ secret: () => "short" });

    const result = await routeAuth(
      request("Bearer short", "/eve/v1/session/wrun_alice/reset"),
      weak
    );

    expect((result as Response).status).toBe(401);
  });
});

describe("accountDeletionReset's secret from the environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const resetWith = (secret: string) =>
    routeAuth(
      request(`Bearer ${secret}`, "/eve/v1/session/wrun_alice/reset"),
      accountDeletionReset()
    );

  it("accepts ARNOLD_RESET_SECRET", async () => {
    vi.stubEnv("ARNOLD_RESET_SECRET", SECRET);
    vi.stubEnv("COACH_RESET_SECRET", `old-${SECRET}`);

    expect(await resetWith(SECRET)).toMatchObject({
      principalId: "account-deletion",
    });
    expect(((await resetWith(`old-${SECRET}`)) as Response).status).toBe(401);
  });

  it("falls back to COACH_RESET_SECRET when ARNOLD_RESET_SECRET is unset", async () => {
    vi.stubEnv("ARNOLD_RESET_SECRET", "");
    vi.stubEnv("COACH_RESET_SECRET", SECRET);

    expect(await resetWith(SECRET)).toMatchObject({
      principalId: "account-deletion",
    });
  });

  it("still refuses the fallback secret on any other route", async () => {
    vi.stubEnv("ARNOLD_RESET_SECRET", "");
    vi.stubEnv("COACH_RESET_SECRET", SECRET);

    const result = await routeAuth(
      request(`Bearer ${SECRET}`, "/eve/v1/session/wrun_alice/stream", "GET"),
      accountDeletionReset()
    );

    expect((result as Response).status).toBe(403);
  });
});
