import { routeAuth } from "eve/channels/auth";
import { describe, expect, it } from "vitest";
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
