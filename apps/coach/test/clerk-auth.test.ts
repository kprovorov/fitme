import { generateKeyPairSync, sign } from "node:crypto";
import { routeAuth } from "eve/channels/auth";
import { describe, expect, it, vi } from "vitest";
import { clerkSession } from "../agent/lib/clerk-auth";

// A stand-in for the Clerk instance's signing key: the channel only ever sees
// its PEM public half, like CLERK_JWT_KEY.
const signer = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwtKey = signer.publicKey
  .export({ format: "pem", type: "spki" })
  .toString();
const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const now = () => Math.floor(Date.now() / 1000);

const clerkToken = (
  claims: Record<string, unknown>,
  privateKey = signer.privateKey
) => {
  const unsigned = `${base64url({ alg: "RS256", kid: "ins_test", typ: "JWT" })}.${base64url(
    {
      exp: now() + 60,
      iat: now() - 5,
      iss: "https://clerk.test",
      nbf: now() - 5,
      ...claims,
    }
  )}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), privateKey);
  return `${unsigned}.${signature.toString("base64url")}`;
};

const request = (authorization?: string, path = "/eve/v1/session") =>
  new Request(`http://coach.test${path}`, {
    headers: authorization ? { authorization } : {},
    method: "POST",
  });

const sessionOwners: Record<string, string> = { wrun_alice: "user_alice" };
const sessionOwner = vi.fn((sessionId: string) =>
  Promise.resolve(sessionOwners[sessionId] ?? null)
);

const auth = clerkSession({ jwtKey: () => jwtKey, sessionOwner });

describe("clerkSession", () => {
  it("makes the verified Clerk User the principal", async () => {
    const result = await routeAuth(
      request(`Bearer ${clerkToken({ sub: "user_alice" })}`),
      auth
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({
      authenticator: "clerk",
      principalId: "user_alice",
      principalType: "user",
    });
  });

  it("answers 401 without a token", async () => {
    const result = await routeAuth(request(), auth);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect((result as Response).headers.get("www-authenticate")).toContain(
      "Bearer"
    );
  });

  it("answers 401 for a token signed by someone else", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const forged = clerkToken({ sub: "user_alice" }, stranger.privateKey);

    const result = await routeAuth(request(`Bearer ${forged}`), auth);

    expect((result as Response).status).toBe(401);
  });

  it("answers 401 for an expired token", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const expired = clerkToken({
      exp: now() - 120,
      iat: now() - 300,
      nbf: now() - 300,
      sub: "user_alice",
    });

    const result = await routeAuth(request(`Bearer ${expired}`), auth);

    expect((result as Response).status).toBe(401);
  });

  it("answers 401 for something that isn't a JWT", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await routeAuth(request("Bearer not-a-jwt"), auth);

    expect((result as Response).status).toBe(401);
  });

  it("fails closed when CLERK_JWT_KEY is missing", async () => {
    const unconfigured = clerkSession({
      jwtKey: () => undefined,
      sessionOwner,
    });

    await expect(
      routeAuth(
        request(`Bearer ${clerkToken({ sub: "user_alice" })}`),
        unconfigured
      )
    ).rejects.toThrow("CLERK_JWT_KEY");
  });

  it("doesn't look up an owner when no session is addressed", async () => {
    await routeAuth(
      request(`Bearer ${clerkToken({ sub: "user_alice" })}`),
      auth
    );

    expect(sessionOwner).not.toHaveBeenCalled();
  });

  it.each([
    "/eve/v1/session/wrun_alice",
    "/eve/v1/session/wrun_alice/stream",
    "/eve/v1/session/wrun_alice/reset",
  ])("lets the owner use their session at %s", async (path) => {
    const result = await routeAuth(
      request(`Bearer ${clerkToken({ sub: "user_alice" })}`, path),
      auth
    );

    expect(result).toMatchObject({ principalId: "user_alice" });
    expect(sessionOwner).toHaveBeenCalledWith("wrun_alice");
  });

  it.each([
    "/eve/v1/session/wrun_alice",
    "/eve/v1/session/wrun_alice/stream",
    "/eve/v1/session/wrun_alice/cancel",
    "/eve/v1/session/wrun_alice/clear",
    "/eve/v1/session/wrun_alice/compact",
    "/eve/v1/session/wrun_alice/reset",
  ])("answers 403 on another User's session at %s", async (path) => {
    const result = await routeAuth(
      request(`Bearer ${clerkToken({ sub: "user_mallory" })}`, path),
      auth
    );

    expect((result as Response).status).toBe(403);
  });

  it("lets a session through before its first turn records it", async () => {
    const result = await routeAuth(
      request(
        `Bearer ${clerkToken({ sub: "user_alice" })}`,
        "/eve/v1/session/wrun_new/stream"
      ),
      auth
    );

    expect(result).toMatchObject({ principalId: "user_alice" });
  });
});
