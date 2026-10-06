import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, extractBearerToken } from "../app.js";
import { callsUserTool } from "../auth.js";
import { USER_TOOL_NAMES } from "../server.js";
import { PUBLIC_TOOL_NAMES } from "../tools/catalog.js";
import { createFakeSupabase, type FakeAuth, ok } from "./fake-supabase.js";
import {
  call,
  connect,
  connectWithFake,
  expectAllCallsRouted,
} from "./harness.js";

const SSE_DATA_LINE = /^data: (.*)$/m;

afterEach(() => {
  vi.unstubAllEnvs();
  expectAllCallsRouted();
});

describe("tool registry", () => {
  it("lists the public and user tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [...PUBLIC_TOOL_NAMES, ...USER_TOOL_NAMES].sort()
    );
  });

  it("annotates reads, deletions and idempotency honestly", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const hints = new Map(tools.map((tool) => [tool.name, tool.annotations]));

    expect(hints.get("get_plan")?.readOnlyHint).toBe(true);
    expect(hints.get("delete_plan")).toMatchObject({
      destructiveHint: true,
      idempotentHint: true,
    });
    expect(hints.get("delete_workout_session")).toMatchObject({
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(hints.get("start_workout_session")?.idempotentHint).toBe(false);
  });
});

describe("public tools", () => {
  it("work without a token or Supabase env", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    const client = await connect();

    const ping = await call(client, "ping");
    expect(ping.isError).toBe(false);
    expect(ping.json).toMatchObject({ ok: true, version: "0.2.0" });

    const group = await call(client, "describe_muscle_group", {
      muscleGroup: "lower-back",
    });
    expect(group.json).toEqual({ id: "lower-back", name: "Lower Back" });
  });
});

describe("authentication", () => {
  it("returns a tool error for user tools without a token", async () => {
    const client = await connect();
    const result = await call(client, "list_plans");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Authentication required");
  });

  it("returns a tool error when Supabase env is missing", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    const client = await connect({ accessToken: "token-123" });
    const result = await call(client, "get_profile");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not configured");
  });

  it("rejects an invalid token with an authentication error", async () => {
    const { client, fake } = await connectWithFake([], {
      error: "invalid JWT: token is expired",
    });
    const result = await call(client, "list_plans");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Authentication failed: invalid JWT");
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects a token getClaims throws on (e.g. expired)", async () => {
    const { client } = await connectWithFake([], {
      throws: new Error("JWT has expired"),
    });
    const result = await call(client, "list_plans");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Authentication failed: JWT has expired");
  });

  it("rejects a valid JWT that carries no user (anon or service key)", async () => {
    const { client, fake } = await connectWithFake([], {});
    const result = await call(client, "list_plans");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("does not belong to a user");
    expect(fake.calls).toHaveLength(0);
  });

  it("reports an unreachable Supabase as a retryable tool error", async () => {
    const { client } = await connectWithFake([], {
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    const result = await call(client, "list_plans");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Could not reach Supabase");
  });

  it("verifies the token once per request", async () => {
    const { client, fake } = await connectWithFake([
      { name: "plans", operation: "select", response: ok([]) },
    ]);
    await call(client, "list_plans");
    await call(client, "list_plans");
    expect(fake.verifiedTokens).toEqual(["token-123"]);
  });

  it("parses bearer tokens from the Authorization header", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(extractBearerToken("bearer abc")).toBe("abc");
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("only treats calls to user tools as needing a token", () => {
    const toolCall = (name: unknown) => ({
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: {}, name },
    });
    expect(callsUserTool(toolCall("list_plans"))).toBe(true);
    expect(callsUserTool(toolCall("ping"))).toBe(false);
    expect(callsUserTool(toolCall(42))).toBe(false);
    expect(callsUserTool(toolCall("no_such_tool"))).toBe(false);
    expect(callsUserTool({ id: 1, jsonrpc: "2.0", method: "tools/list" })).toBe(
      false
    );
    expect(callsUserTool([toolCall("ping"), toolCall("get_profile")])).toBe(
      true
    );
    expect(callsUserTool(undefined)).toBe(false);
    expect(callsUserTool("tools/call")).toBe(false);
  });
});

const ISSUER = "https://project.supabase.co/auth/v1";
const METADATA_URL = "http://localhost/.well-known/oauth-protected-resource";

type TestApp = ReturnType<typeof createApp>;

const rpc = (
  app: TestApp,
  body: Record<string, unknown>,
  token?: string
): Promise<Response> => {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return Promise.resolve(
    app.request("/", {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", ...body }),
      headers,
      method: "POST",
    })
  );
};

const callToolOver = (
  app: TestApp,
  name: string,
  token?: string
): Promise<Response> =>
  rpc(app, { method: "tools/call", params: { arguments: {}, name } }, token);

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

describe("HTTP endpoint", () => {
  const profiles: Record<string, string> = { alice: "metric", bob: "us" };

  const createTestApp = (
    authorizationServer: string | null = ISSUER,
    auth?: FakeAuth
  ) => {
    const fakes = new Map<string, ReturnType<typeof createFakeSupabase>>();
    const app = createApp({
      authorizationServer,
      createSupabaseClient: (token) => {
        const fake = createFakeSupabase(
          [
            {
              filters: [["eq", "user_id", `user-${token}`]],
              name: "profiles",
              operation: "select",
              response: ok({
                age: 30,
                gender: "female",
                height: 170,
                measurement_system: profiles[token],
                weight: 60,
              }),
            },
          ],
          auth ?? { userId: `user-${token}` }
        );
        fakes.set(token, fake);
        return fake.client;
      },
      logRequests: false,
    });
    return { app, fakes };
  };

  it("passes each request's bearer token to the tools without sharing state", async () => {
    const { app, fakes } = createTestApp();

    const aliceResponse = await callToolOver(app, "get_profile", "alice");
    const bobResponse = await callToolOver(app, "get_profile", "bob");

    expect([aliceResponse.status, bobResponse.status]).toEqual([200, 200]);
    const alice = await readToolResult(aliceResponse);
    const bob = await readToolResult(bobResponse);
    expect(alice.isError).toBe(false);
    expect(JSON.parse(alice.text)).toMatchObject({
      measurement_system: "metric",
      units: { height: "cm", weight: "kg" },
    });
    expect(bob.isError).toBe(false);
    expect(JSON.parse(bob.text)).toMatchObject({
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
    });
    // Verified once per request: the 401 check and the tool share the result.
    expect(fakes.get("alice")?.verifiedTokens).toEqual(["alice"]);
    expect(fakes.get("bob")?.verifiedTokens).toEqual(["bob"]);
    expect(fakes.get("alice")?.unmatched).toEqual([]);
    expect(fakes.get("bob")?.unmatched).toEqual([]);
  });

  it("answers a user tool call without a token with 401 and the metadata URL", async () => {
    const { app, fakes } = createTestApp();
    await callToolOver(app, "get_profile", "alice");

    const response = await callToolOver(app, "get_profile");

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      `Bearer resource_metadata="${METADATA_URL}"`
    );
    // RFC 6750: no error code when no credentials were sent.
    expect(await response.json()).toEqual({
      error_description: expect.stringContaining("Authentication required"),
    });
    expect(fakes.size).toBe(1);
  });

  it("answers a rejected token with 401 invalid_token", async () => {
    const { app } = createTestApp(ISSUER, {
      error: 'invalid JWT: "expired"',
    });

    const response = await callToolOver(app, "list_plans", "stale");

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      `Bearer error="invalid_token", error_description="Authentication failed: invalid JWT: expired. The bearer token must be a valid, unexpired Supabase access token for a Fitme user.", resource_metadata="${METADATA_URL}"`
    );
  });

  it("rejects a bad token on any request, not just user tool calls", async () => {
    const { app } = createTestApp(ISSUER, {
      throws: new Error("JWT has expired"),
    });

    const list = await rpc(app, { method: "tools/list" }, "stale");
    const ping = await callToolOver(app, "ping", "stale");

    expect([list.status, ping.status]).toEqual([401, 401]);
    expect(await list.json()).toMatchObject({ error: "invalid_token" });
  });

  it("answers an unknown tool without a token with the usual error, not 401", async () => {
    const { app, fakes } = createTestApp();

    const response = await callToolOver(app, "no_such_tool");

    expect(response.status).toBe(200);
    expect(fakes.size).toBe(0);
  });

  it("keeps discovery and public tools anonymous", async () => {
    const { app, fakes } = createTestApp();

    const initialize = await rpc(app, {
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.0" },
        protocolVersion: "2025-06-18",
      },
    });
    const list = await rpc(app, { method: "tools/list" });
    const ping = await callToolOver(app, "ping");

    expect([initialize.status, list.status, ping.status]).toEqual([
      200, 200, 200,
    ]);
    expect((await readToolResult(ping)).isError).toBe(false);
    expect(fakes.size).toBe(0);
  });

  it("does not ask for a new token when Supabase is unreachable", async () => {
    const { app } = createTestApp(ISSUER, {
      error: new AuthRetryableFetchError("fetch failed", 0),
    });

    const response = await callToolOver(app, "list_plans", "alice");

    expect(response.status).toBe(200);
    const result = await readToolResult(response);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Could not reach Supabase");
  });

  it("falls back to tool errors when OAuth is not configured", async () => {
    const { app } = createTestApp(null);

    const response = await callToolOver(app, "get_profile");

    expect(response.status).toBe(200);
    const result = await readToolResult(response);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Authentication required");
  });

  it("uses Supabase Auth from the environment as the authorization server", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co/");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
    const app = createApp({ logRequests: false });

    const response = await app.request(
      "http://localhost/.well-known/oauth-protected-resource"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authorization_servers: [ISSUER],
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
    const challenge = await callToolOver(app, "list_plans");

    expect(await metadata.json()).toMatchObject({
      resource: "https://mcp.fitmeproject.com/",
    });
    expect(challenge.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://mcp.fitmeproject.com/.well-known/oauth-protected-resource"'
    );
  });

  it("serves no metadata without an authorization server", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    const app = createApp({ logRequests: false });

    const response = await app.request("/.well-known/oauth-protected-resource");

    expect(response.status).toBe(404);
  });

  it("exposes the challenge header to browser clients", async () => {
    const { app } = createTestApp();

    const response = await app.request("/", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "list_plans" },
      }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://example.com",
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
      "WWW-Authenticate"
    );
  });
});
