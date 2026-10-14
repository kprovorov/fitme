import { getAuth } from "@clerk/hono";
import { decodeJwt, importJWK, jwtVerify, UnsecuredJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { ServicesFactory } from "../services.js";
import { createFakeSupabase, ok } from "./fake-supabase.js";
import { expectAllCallsRouted, fakeServices } from "./harness.js";
import { SIGNING_KEY } from "./signing-key.js";

// Clerk is stubbed at its SDK boundary: no Clerk instance or network. The
// middleware passes through and `getAuth` answers what each test sets up.
vi.mock("@clerk/hono", () => ({
  clerkMiddleware: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  getAuth: vi.fn(),
}));

const mockedGetAuth = vi.mocked(getAuth);

const SSE_DATA_LINE = /^data: (.*)$/m;
const CLERK_FRONTEND_API = "fitme-test.clerk.accounts.dev";
const PUBLISHABLE_KEY = `pk_test_${btoa(`${CLERK_FRONTEND_API}$`)}`;
const METADATA_URL = "http://localhost/.well-known/oauth-protected-resource";
const NOW = new Date("2026-10-13T12:00:00Z");
const NOW_SECONDS = NOW.getTime() / 1000;

/** A Clerk-shaped OAuth access token; only its `exp` is read. */
const clerkToken = (userId: string, exp = NOW_SECONDS + 3600) =>
  new UnsecuredJWT({ sub: userId }).setExpirationTime(exp).encode();

/** Makes `getAuth` accept the request's OAuth token as `userId`. */
const signInAs = (userId: string) => {
  mockedGetAuth.mockImplementation(
    () =>
      ({
        clientId: "client_test",
        isAuthenticated: true,
        scopes: ["openid", "profile", "email"],
        tokenType: "oauth_token",
        userId,
      }) as unknown as ReturnType<typeof getAuth>
  );
};

/** Makes `getAuth` reject the token (expired, revoked, wrong instance…). */
const rejectToken = () => {
  mockedGetAuth.mockReturnValue({
    clientId: null,
    isAuthenticated: false,
    tokenType: "oauth_token",
    userId: null,
  } as unknown as ReturnType<typeof getAuth>);
};

const verifySupabaseToken = async (token: string) => {
  const { d: _private, ...publicKey } = SIGNING_KEY;
  const { payload } = await jwtVerify(
    token,
    await importJWK({ ...publicKey, key_ops: ["verify"] }, "ES256"),
    { currentDate: NOW }
  );
  return payload;
};

type TestApp = ReturnType<typeof createApp>;

const rpc = (
  app: TestApp,
  body: Record<string, unknown>,
  token?: string,
  extraHeaders: Record<string, string> = {}
): Promise<Response> =>
  Promise.resolve(
    app.request("/", {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", ...body }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      method: "POST",
    })
  );

const initialize = (app: TestApp, token?: string) =>
  rpc(
    app,
    {
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.0" },
        protocolVersion: "2025-06-18",
      },
    },
    token
  );

const listTools = (app: TestApp, token?: string) =>
  rpc(app, { method: "tools/list" }, token);

const callTool = (
  app: TestApp,
  name: string,
  token?: string,
  args: Record<string, unknown> = {}
) =>
  rpc(app, { method: "tools/call", params: { arguments: args, name } }, token);

const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const session = { exercises: [], finished_at: null, id: SESSION_ID };

/** A tool still on Supabase (it answers `get_workout_session` for `SESSION_ID`). */
const callSupabaseTool = (app: TestApp, token?: string) =>
  callTool(app, "get_workout_session", token, { sessionId: SESSION_ID });

/** The tool result inside a 200 SSE response. */
const readToolResult = async (response: Response) => {
  const [, data] = (await response.text()).match(SSE_DATA_LINE) ?? [];
  const message = JSON.parse(data ?? "{}");
  const [content] = message.result.content;
  return {
    isError: message.result.isError === true,
    text: String(content.text),
  };
};

const profiles: Record<string, string> = {
  user_alice: "metric",
  user_bob: "us",
};

const unitsOf: Record<string, { height: string; weight: string }> = {
  metric: { height: "cm", weight: "kg" },
  us: { height: "in", weight: "lbs" },
};

/** Services answering the Profile of whichever User they were built for. */
const profileServices: ServicesFactory = (userId) =>
  fakeServices({
    getProfile: () =>
      Promise.resolve({
        age: 30,
        gender: "female",
        height: 170,
        measurement_system: profiles[userId] ?? "metric",
        units: unitsOf[profiles[userId] ?? "metric"] ?? unitsOf.metric,
        weight: 60,
      }),
  });

/**
 * The app with fake services and a fake Supabase client per request. Records
 * the User id every services object is built for and every signed token the
 * Supabase client receives (it answers `get_workout_session` for `SESSION_ID`).
 */
const createTestApp = () => {
  const servicesUserIds: string[] = [];
  const supabaseTokens: string[] = [];
  const app = createApp({
    createServices: (userId) => {
      servicesUserIds.push(userId);
      return profileServices(userId);
    },
    createSupabaseClient: (token) => {
      supabaseTokens.push(token);
      return createFakeSupabase([
        {
          filters: [["eq", "id", SESSION_ID]],
          name: "workout_sessions",
          operation: "select",
          response: ok(session),
        },
      ]).client;
    },
    logRequests: false,
  });
  return { app, servicesUserIds, supabaseTokens };
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
  vi.stubEnv("CLERK_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv("SUPABASE_JWT_SIGNING_KEY", JSON.stringify(SIGNING_KEY));
  vi.stubEnv(
    "FITME_DATABASE_URL",
    "postgresql://fitme.test:secret@127.0.0.1:1/postgres?application_name=mcp"
  );
  vi.stubEnv("MCP_PUBLIC_URL", "");
  mockedGetAuth.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  expectAllCallsRouted();
});

describe("without a token", () => {
  it.each([
    ["initialize", initialize],
    ["tools/list", listTools],
    ["a catalog tool call", (app: TestApp) => callTool(app, "ping")],
    ["a user tool call", (app: TestApp) => callTool(app, "list_plans")],
  ])("answers %s with 401 and the metadata URL", async (_name, send) => {
    const { app, supabaseTokens } = createTestApp();

    const response = await send(app);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      `Bearer resource_metadata="${METADATA_URL}"`
    );
    // RFC 6750: no error code when no credentials were sent.
    expect(await response.json()).not.toHaveProperty("error");
    expect(supabaseTokens).toEqual([]);
  });

  it("treats a non-Bearer Authorization header as no token", async () => {
    const { app } = createTestApp();

    const response = await rpc(app, { method: "tools/list" }, undefined, {
      Authorization: "Basic abc",
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).not.toContain("error=");
  });

  it("exposes the challenge header to browser clients", async () => {
    const { app } = createTestApp();

    const response = await rpc(app, { method: "tools/list" }, undefined, {
      Origin: "https://example.com",
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
      "WWW-Authenticate"
    );
  });
});

describe("with a token Clerk rejects", () => {
  it("answers 401 invalid_token on every method", async () => {
    rejectToken();
    const { app, supabaseTokens } = createTestApp();
    const token = clerkToken("user_alice");

    const responses = [
      await initialize(app, token),
      await listTools(app, token),
      await callTool(app, "ping", token),
    ];

    const bodies = await Promise.all(
      responses.map((response) => response.json())
    );
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe(
        `Bearer error="invalid_token", error_description="The access token is invalid or expired. Sign in again.", resource_metadata="${METADATA_URL}"`
      );
    }
    for (const body of bodies) {
      expect(body).toMatchObject({ error: "invalid_token" });
    }
    expect(supabaseTokens).toEqual([]);
  });

  it("asks Clerk to accept OAuth tokens only", async () => {
    rejectToken();
    const { app } = createTestApp();

    await listTools(app, clerkToken("user_alice"));

    expect(mockedGetAuth).toHaveBeenCalledWith(expect.anything(), {
      acceptsToken: "oauth_token",
    });
  });
});

describe("misconfiguration", () => {
  it.each([
    "CLERK_SECRET_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "SUPABASE_JWT_SIGNING_KEY",
    "FITME_DATABASE_URL",
  ])("answers 500 instead of serving when %s is missing", async (name) => {
    vi.stubEnv(name, "");
    signInAs("user_alice");
    const { app, servicesUserIds, supabaseTokens } = createTestApp();

    const withToken = await callTool(app, "ping", clerkToken("user_alice"));
    const withoutToken = await callTool(app, "ping");

    expect([withToken.status, withoutToken.status]).toEqual([500, 500]);
    expect(await withToken.json()).toEqual({
      error: {
        code: "not_configured",
        message: expect.stringContaining(name),
      },
    });
    expect(mockedGetAuth).not.toHaveBeenCalled();
    expect(servicesUserIds).toEqual([]);
    expect(supabaseTokens).toEqual([]);
  });
});

describe("public routes", () => {
  it("serves /health without a token or config", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const { app } = createTestApp();

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("names the Clerk instance as the authorization server", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "http://localhost/.well-known/oauth-protected-resource"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authorization_servers: [`https://${CLERK_FRONTEND_API}`],
      bearer_methods_supported: ["header"],
      resource: "http://localhost/",
      resource_name: "Fitme",
    });
  });

  it("advertises MCP_PUBLIC_URL as the resource behind a proxy", async () => {
    vi.stubEnv("MCP_PUBLIC_URL", "https://mcp.fitmeproject.com");
    const { app } = createTestApp();

    const metadata = await app.request(
      "http://internal:3002/.well-known/oauth-protected-resource"
    );
    const challenge = await callTool(app, "list_plans");

    expect(await metadata.json()).toMatchObject({
      resource: "https://mcp.fitmeproject.com/",
    });
    expect(challenge.headers.get("WWW-Authenticate")).toBe(
      'Bearer resource_metadata="https://mcp.fitmeproject.com/.well-known/oauth-protected-resource"'
    );
  });
});

describe("with a valid Clerk token", () => {
  it("runs services as the Clerk User", async () => {
    signInAs("user_alice");
    const { app, servicesUserIds, supabaseTokens } = createTestApp();

    const response = await callTool(
      app,
      "get_profile",
      clerkToken("user_alice")
    );

    expect(response.status).toBe(200);
    const result = await readToolResult(response);
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({
      measurement_system: "metric",
    });
    expect(servicesUserIds).toEqual(["user_alice"]);
    expect(supabaseTokens).toEqual([]);
  });

  it("runs Supabase tools with a token signed for the Clerk User", async () => {
    signInAs("user_alice");
    const { app, supabaseTokens } = createTestApp();

    const response = await callSupabaseTool(app, clerkToken("user_alice"));

    expect(response.status).toBe(200);
    const result = await readToolResult(response);
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ id: SESSION_ID });
    expect(supabaseTokens).toHaveLength(1);
    expect(await verifySupabaseToken(supabaseTokens[0] ?? "")).toEqual({
      aud: "authenticated",
      exp: NOW_SECONDS + 300,
      iat: NOW_SECONDS,
      iss: "fitme-mcp",
      role: "authenticated",
      sub: "user_alice",
    });
  });

  it("never lets the Supabase token outlive the Clerk token", async () => {
    signInAs("user_alice");
    const { app, supabaseTokens } = createTestApp();

    const response = await callSupabaseTool(
      app,
      clerkToken("user_alice", NOW_SECONDS + 42)
    );

    expect((await readToolResult(response)).isError).toBe(false);

    expect(decodeJwt(supabaseTokens[0] ?? "").exp).toBe(NOW_SECONDS + 42);
  });

  it("scopes each request to its own User", async () => {
    const { app } = createTestApp();

    signInAs("user_alice");
    const alice = await callTool(app, "get_profile", clerkToken("user_alice"));
    signInAs("user_bob");
    const bob = await callTool(app, "get_profile", clerkToken("user_bob"));

    expect(JSON.parse((await readToolResult(alice)).text)).toMatchObject({
      measurement_system: "metric",
      units: { height: "cm", weight: "kg" },
    });
    expect(JSON.parse((await readToolResult(bob)).text)).toMatchObject({
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
    });
  });

  it("serves initialize, tools/list and catalog tools without touching the database", async () => {
    signInAs("user_alice");
    const { app, servicesUserIds, supabaseTokens } = createTestApp();
    const token = clerkToken("user_alice");

    const responses = [
      await initialize(app, token),
      await listTools(app, token),
      await callTool(app, "ping", token),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
    expect((await readToolResult(responses[2] as Response)).isError).toBe(
      false
    );
    expect(servicesUserIds).toEqual([]);
    expect(supabaseTokens).toEqual([]);
  });

  it("reports missing database config as a tool error", async () => {
    signInAs("user_alice");
    const app = createApp({ createServices: () => null, logRequests: false });

    const response = await callTool(
      app,
      "get_profile",
      clerkToken("user_alice")
    );

    expect(response.status).toBe(200);
    const result = await readToolResult(response);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not configured");
  });

  it("reports missing Supabase config as a tool error", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    signInAs("user_alice");
    const app = createApp({ logRequests: false });

    const response = await callSupabaseTool(app, clerkToken("user_alice"));

    expect(response.status).toBe(200);
    const result = await readToolResult(response);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not configured");
  });
});
