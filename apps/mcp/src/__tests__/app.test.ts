import { getAuth } from "@clerk/hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../create-app.js";
import type { ServicesFactory } from "../services.js";
import { fakeServices, ignoreReports, recordingReporter } from "./harness.js";

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

/** A bearer token for `userId` (Clerk is stubbed, so its shape doesn't matter). */
const clerkToken = (userId: string) => `oat_${userId}`;

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
 * The app with fake services, recording the User id every services object is
 * built for, every User identified to observability and every reported error.
 */
const createTestApp = () => {
  const servicesUserIds: string[] = [];
  const identifiedUserIds: string[] = [];
  const { reportError, reported } = recordingReporter();
  const app = createApp({
    createServices: (userId) => {
      servicesUserIds.push(userId);
      return profileServices(userId);
    },
    identifyUser: (userId) => {
      identifiedUserIds.push(userId);
    },
    logRequests: false,
    reportError,
  });
  return { app, identifiedUserIds, reported, servicesUserIds };
};

beforeEach(() => {
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
  vi.stubEnv("CLERK_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv(
    "FITME_DATABASE_URL",
    "postgresql://fitme.test:secret@127.0.0.1:1/postgres?application_name=mcp"
  );
  vi.stubEnv("MCP_PUBLIC_URL", "");
  mockedGetAuth.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("without a token", () => {
  it.each([
    ["initialize", initialize],
    ["tools/list", listTools],
    ["a catalog tool call", (app: TestApp) => callTool(app, "ping")],
    ["a user tool call", (app: TestApp) => callTool(app, "list_plans")],
  ])("answers %s with 401 and the metadata URL", async (_name, send) => {
    const { app, reported, servicesUserIds } = createTestApp();

    const response = await send(app);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      `Bearer resource_metadata="${METADATA_URL}"`
    );
    // RFC 6750: no error code when no credentials were sent.
    expect(await response.json()).not.toHaveProperty("error");
    expect(servicesUserIds).toEqual([]);
    expect(reported).toEqual([]);
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
    const { app, servicesUserIds } = createTestApp();
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
    expect(servicesUserIds).toEqual([]);
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
  it.each(["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "FITME_DATABASE_URL"])(
    "answers 500 instead of serving when %s is missing",
    async (name) => {
      vi.stubEnv(name, "");
      signInAs("user_alice");
      const { app, servicesUserIds } = createTestApp();

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
    }
  );
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
    const { app, servicesUserIds } = createTestApp();

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
    const { app, servicesUserIds } = createTestApp();
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
  });

  it("reports missing database config as a tool error", async () => {
    signInAs("user_alice");
    const app = createApp({
      createServices: () => null,
      logRequests: false,
      reportError: ignoreReports,
    });

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
});

describe("observability", () => {
  it("identifies the verified Clerk User, never one from tool input", async () => {
    signInAs("user_alice");
    const { app, identifiedUserIds } = createTestApp();

    await callTool(app, "get_profile", clerkToken("user_alice"), {
      userId: "user_mallory",
    });

    expect(identifiedUserIds).toEqual(["user_alice"]);
  });

  it("neither identifies nor reports a rejected token", async () => {
    rejectToken();
    const { app, identifiedUserIds, reported } = createTestApp();

    const response = await listTools(app, "oat_expired");

    expect(response.status).toBe(401);
    expect(identifiedUserIds).toEqual([]);
    expect(reported).toEqual([]);
  });

  it("reports an unhandled error and answers a JSON 500", async () => {
    const crash = new Error("Clerk is down");
    mockedGetAuth.mockImplementation(() => {
      throw crash;
    });
    const { app, reported } = createTestApp();

    const response = await listTools(app, clerkToken("user_alice"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal_error", message: "Internal server error" },
    });
    expect(reported).toEqual([crash]);
  });
});
