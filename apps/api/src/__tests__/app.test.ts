import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { clerkInstance, clerkToken } from "../test/clerk.js";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const profile = {
  age: 30,
  gender: "female",
  height: 170.5,
  measurement_system: "metric",
  units: { height: "cm", weight: "kg" },
  weight: 60.25,
};

/** The app with a few routes that fail on purpose, behind auth like any route. */
const failingApp = () => {
  const test = testApp();
  const crash = new Error("boom");
  test.app.get("/test/crash", () => {
    throw crash;
  });
  test.app.get("/test/teapot", () => {
    throw new HTTPException(418, { message: "I'm a teapot" });
  });
  return { ...test, crash };
};

const unauthorized = {
  error: {
    code: "unauthorized",
    message: "A valid Clerk session token is required",
  },
};

const now = () => Math.floor(Date.now() / 1000);

describe("app", () => {
  it("answers /health without a token", async () => {
    const { app } = testApp();

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("answers the global routes without a token", async () => {
    const { app } = testApp();

    const response = await app.request("/v1/muscle-groups");

    expect(response.status).toBe(200);
  });

  it("answers an unknown route with no token 401, unreported", async () => {
    const { app, reported } = testApp();

    const response = await app.request("/nope");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(unauthorized);
    expect(reported).toEqual([]);
  });

  it("answers an unknown route with a valid token 404, unreported", async () => {
    const { app, reported } = testApp();

    const response = await app.request("/nope", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Route not found" },
    });
    expect(reported).toEqual([]);
  });

  it("answers a CORS preflight before auth", async () => {
    const { app } = testApp();

    const response = await app.request("/v1/profile", {
      headers: {
        "access-control-request-headers": "authorization",
        "access-control-request-method": "GET",
        origin: "https://app.test",
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("makes a 401 readable cross-origin", async () => {
    const { app } = testApp();

    const response = await app.request("/v1/profile", {
      headers: { origin: "https://app.test" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("reports an unhandled error and answers a JSON 500", async () => {
    const { app, crash, reported } = failingApp();

    const response = await app.request("/test/crash", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal_error", message: "Internal server error" },
    });
    expect(reported).toEqual([crash]);
  });

  it("answers an HTTP error with its status without reporting it", async () => {
    const { app, reported } = failingApp();

    const response = await app.request("/test/teapot", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(418);
    expect(await response.json()).toEqual({
      error: { code: "http_error", message: "I'm a teapot" },
    });
    expect(reported).toEqual([]);
  });

  it("doesn't report a route's own 4xx", async () => {
    const { app, reported } = testApp();

    const response = await app.request("/v1/muscle-groups/elbows");

    expect(response.status).toBe(404);
    expect(reported).toEqual([]);
  });
});

describe("auth", () => {
  const rejected: [string, Record<string, string>][] = [
    ["no token", {}],
    ["a malformed header", { authorization: "Token abc" }],
    ["a malformed token", { authorization: "Bearer not.a.jwt" }],
    [
      "an expired token",
      signedInAs("user_alice", { exp: now() - 60, iat: now() - 120 }),
    ],
    ["a token without a session", signedInAs("user_alice", { sid: undefined })],
    [
      "a token from another Clerk instance",
      {
        authorization: `Bearer ${clerkToken(clerkInstance().privateKey, { sub: "user_alice" })}`,
      },
    ],
  ];

  it.each(rejected)(
    "answers %s 401 unauthorized, unreported",
    async (_, headers) => {
      const { app, reported, servicesFor } = testApp({
        services: fakeServices({ getProfile: () => Promise.resolve(profile) }),
      });

      const response = await app.request("/v1/profile", { headers });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(unauthorized);
      expect(reported).toEqual([]);
      expect(servicesFor).toEqual([]);
    }
  );

  it("never serves without CLERK_JWT_KEY: a reported 500", async () => {
    const { app, reported, servicesFor } = testApp({ clerkJwtKey: undefined });

    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(500);
    expect(reported).toHaveLength(1);
    expect(String(reported[0])).toContain("CLERK_JWT_KEY");
    expect(servicesFor).toEqual([]);
  });

  it("answers a reported 500 without FITME_DATABASE_URL", async () => {
    const { app, reported } = testApp({ services: null });

    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(500);
    expect(reported).toHaveLength(1);
    expect(String(reported[0])).toContain("FITME_DATABASE_URL");
  });

  it("builds the services for the token's User and identifies only them to Sentry", async () => {
    const { app, identified, servicesFor } = testApp({
      services: fakeServices({ getProfile: () => Promise.resolve(profile) }),
    });

    const response = await app.request("/v1/profile?user_id=user_mallory", {
      headers: {
        ...signedInAs("user_alice"),
        "x-user-id": "user_mallory",
      },
    });

    expect(response.status).toBe(200);
    expect(servicesFor).toEqual(["user_alice"]);
    expect(identified).toEqual(["user_alice"]);
  });
});
