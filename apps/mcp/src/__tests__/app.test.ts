import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  MAX_BATCH_SIZE,
} from "@modelcontextprotocol/sdk/server/requestBody.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  CallToolRequest,
  JSONRPCRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createApp } from "../create-app.js";
import type { ServicesFactory } from "../services.js";
import { fakeServices, ignoreReports, recordingReporter } from "./harness.js";

const SSE_DATA_LINE = /^data: (?<data>.*)$/mu;
const PLAIN_TEXT = /^text\/plain/u;
const CLERK_FRONTEND_API = "fitme-test.clerk.accounts.dev";
const PUBLISHABLE_KEY = `pk_test_${btoa(`${CLERK_FRONTEND_API}$`)}`;
const METADATA_URL = "http://localhost/.well-known/oauth-protected-resource";

const CLERK_API_URL = "https://clerk.test";
const acceptedTokens = new Map<string, string>();
const verifiedTokens: string[] = [];
const tokenRequest = z.object({ access_token: z.string() });
const apiKeyRequest = z.object({ secret: z.literal("ak_test_key") });

/** A faithful Clerk Backend API boundary; the real SDK still authenticates. */
const clerkBackend = new Hono()
  .post("/oauth_applications/access_tokens/verify", async (c) => {
    const { access_token: token } = tokenRequest.parse(await c.req.json());
    verifiedTokens.push(token);
    const userId = acceptedTokens.get(token);

    if (!userId) {
      return c.json(
        {
          errors: [{ code: "resource_not_found", message: "Token not found" }],
        },
        404
      );
    }

    return c.json({
      client_id: "client_test",
      created_at: 0,
      expiration: null,
      expired: false,
      id: token,
      object: "clerk_idp_oauth_access_token",
      revocation_reason: null,
      revoked: false,
      scopes: ["openid", "profile", "email"],
      subject: userId,
      type: "oauth_token",
      updated_at: 0,
    });
  })
  .post("/api_keys/verify", async (c) => {
    const { secret } = apiKeyRequest.parse(await c.req.json());
    verifiedTokens.push(secret);

    return c.json({
      claims: null,
      created_at: 0,
      created_by: null,
      description: null,
      expiration: null,
      expired: false,
      id: "ak_test",
      last_used_at: null,
      name: "test",
      object: "api_key",
      revocation_reason: null,
      revoked: false,
      scopes: [],
      subject: "user_alice",
      type: "api_key",
      updated_at: 0,
    });
  });

const clerkFetch = (input: string | URL | Request, init?: RequestInit) => {
  const request = new Request(input, init);

  if (new URL(request.url).origin !== CLERK_API_URL) {
    throw new Error(`Unexpected request to ${request.url}`);
  }

  return Promise.resolve(clerkBackend.request(request));
};

/** A bearer token that the fake Backend API can accept or reject. */
const clerkToken = (userId: string) => `oat_${userId}`;

const signInAs = (userId: string) => {
  acceptedTokens.set(clerkToken(userId), userId);
};

const rejectToken = () => {
  acceptedTokens.clear();
};

type TestApp = ReturnType<typeof createApp>;

const rpc = (
  app: TestApp,
  body: Pick<JSONRPCRequest, "method" | "params">,
  token?: string,
  extraHeaders: Record<string, string> = {}
): Promise<Response> => {
  const headers = new Headers({
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  });

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }

  return Promise.resolve(
    app.request("/", {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", ...body }),
      headers,
      method: "POST",
    })
  );
};

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

/** A bodiless request to the MCP endpoint with some other method. */
const requestMethod = (
  app: TestApp,
  method: string,
  token?: string,
  extraHeaders: Record<string, string> = {}
): Promise<Response> => {
  const headers = new Headers({
    // The standalone SSE stream a GET would open.
    Accept: "text/event-stream",
  });

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }

  return Promise.resolve(
    app.request("/", {
      headers,
      method,
    })
  );
};

const callTool = (
  app: TestApp,
  name: string,
  token?: string,
  args: NonNullable<CallToolRequest["params"]["arguments"]> = {}
) =>
  rpc(app, { method: "tools/call", params: { arguments: args, name } }, token);

/** The tool result inside a 200 SSE response. */
const readToolResult = async (response: Response) => {
  const text = await response.text();
  const data = SSE_DATA_LINE.exec(text)?.groups?.data;
  const message = JSON.parse(data ?? "{}");
  const [content] = message.result.content;

  return {
    isError: message.result.isError === true,
    text: String(content.text),
  };
};

const profiles = new Map<string, "metric" | "us">([
  ["user_alice", "metric"],
  ["user_bob", "us"],
]);

const unitsOf = {
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
        measurement_system: profiles.get(userId) ?? "metric",
        units: unitsOf[profiles.get(userId) ?? "metric"] ?? unitsOf.metric,
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

// A revision no SDK will ever support (a client on 2026-07-28 today)
const UNSUPPORTED_VERSION = "9999-12-31";

const toolsListOn = (version: string) =>
  new Request("http://localhost/", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${clerkToken("user_alice")}`,
      "Content-Type": "application/json",
      "Mcp-Protocol-Version": version,
    },
    method: "POST",
  });

/** What the SDK's own transport answers the request. */
const transportAnswer = async (request: Request) => {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await new McpServer({ name: "sdk", version: "0.0.0" }).connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close();
  }
};

const oversizedBatch = () =>
  new Request("http://localhost/", {
    body: JSON.stringify(
      Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, id) => ({
        id,
        jsonrpc: "2.0",
        method: "tools/list",
      }))
    ),
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${clerkToken("user_alice")}`,
      "Content-Type": "application/json",
      "Mcp-Protocol-Version": UNSUPPORTED_VERSION,
    },
    method: "POST",
  });

const oversized = (version: string) =>
  new Request("http://localhost/", {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "tools/list",
      params: { padding: "x".repeat(DEFAULT_MAX_REQUEST_BODY_SIZE) },
    }),
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${clerkToken("user_alice")}`,
      "Content-Type": "application/json",
      "Mcp-Protocol-Version": version,
    },
    method: "POST",
  });

describe("mcp app", () => {
  beforeEach(() => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
    vi.stubEnv("CLERK_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
    vi.stubEnv(
      "FITME_DATABASE_URL",
      "postgresql://fitme.test:secret@127.0.0.1:1/postgres?application_name=mcp"
    );
    vi.stubEnv("MCP_PUBLIC_URL", "");
    acceptedTokens.clear();
    verifiedTokens.length = 0;
    vi.stubEnv("CLERK_API_URL", CLERK_API_URL);
    vi.stubGlobal("fetch", clerkFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
      await expect(response.json()).resolves.not.toHaveProperty("error");
      expect(servicesUserIds).toStrictEqual([]);
      expect(reported).toStrictEqual([]);
    });

    it("treats a non-Bearer Authorization header as no token", async () => {
      const { app } = createTestApp();

      const response = await rpc(app, { method: "tools/list" }, undefined, {
        Authorization: "Basic abc",
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).not.toContain("error=");
    });

    it("answers GET with 401 before deciding the method is unsupported", async () => {
      const { app } = createTestApp();

      const response = await requestMethod(app, "GET");

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe(
        `Bearer resource_metadata="${METADATA_URL}"`
      );
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

      expect(servicesUserIds).toStrictEqual([]);
    });

    it("rejects a verified Clerk API key because only OAuth tokens are accepted", async () => {
      rejectToken();
      const { app } = createTestApp();

      const response = await listTools(app, "ak_test_key");

      expect(verifiedTokens).toStrictEqual(["ak_test_key"]);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: "invalid_token",
      });
    });
  });

  describe("misconfiguration", () => {
    it.each([
      "CLERK_SECRET_KEY",
      "CLERK_PUBLISHABLE_KEY",
      "FITME_DATABASE_URL",
    ])("answers 500 instead of serving when %s is missing", async (name) => {
      vi.stubEnv(name, "");
      signInAs("user_alice");
      const { app, servicesUserIds } = createTestApp();

      const withToken = await callTool(app, "ping", clerkToken("user_alice"));
      const withoutToken = await callTool(app, "ping");

      expect([withToken.status, withoutToken.status]).toStrictEqual([500, 500]);
      await expect(withToken.json()).resolves.toStrictEqual({
        error: {
          code: "not_configured",
          message: expect.stringContaining(name),
        },
      });
      expect(verifiedTokens).toStrictEqual([]);
      expect(servicesUserIds).toStrictEqual([]);
    });
  });

  describe("public routes", () => {
    it("serves /health without a token or config", async () => {
      vi.stubEnv("CLERK_SECRET_KEY", "");
      const { app } = createTestApp();

      const response = await app.request("/health");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toStrictEqual({ ok: true });
    });

    it("serves the OpenAI Apps challenge from the env without a token or config", async () => {
      vi.stubEnv("CLERK_SECRET_KEY", "");
      vi.stubEnv("OPENAI_APPS_CHALLENGE", "challenge-token");
      const { app } = createTestApp();

      const response = await app.request("/.well-known/openai-apps-challenge");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(PLAIN_TEXT);
      await expect(response.text()).resolves.toBe("challenge-token");
    });

    it.each(["", "   "])(
      "answers 404 for the OpenAI Apps challenge while its env is %j",
      async (value) => {
        vi.stubEnv("OPENAI_APPS_CHALLENGE", value);
        const { app } = createTestApp();

        const response = await app.request(
          "/.well-known/openai-apps-challenge"
        );

        expect(response.status).toBe(404);
      }
    );

    it("names the Clerk instance as the authorization server", async () => {
      const { app } = createTestApp();

      const response = await app.request(
        "http://localhost/.well-known/oauth-protected-resource"
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
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

      await expect(metadata.json()).resolves.toMatchObject({
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
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.text)).toMatchObject({
        measurement_system: "metric",
      });
      expect(servicesUserIds).toStrictEqual(["user_alice"]);
    });

    it("scopes each request to its own User", async () => {
      const { app } = createTestApp();

      signInAs("user_alice");

      const alice = await callTool(
        app,
        "get_profile",
        clerkToken("user_alice")
      );

      signInAs("user_bob");

      const bob = await callTool(app, "get_profile", clerkToken("user_bob"));

      const aliceResult = await readToolResult(alice);
      const bobResult = await readToolResult(bob);

      expect(JSON.parse(aliceResult.text)).toMatchObject({
        measurement_system: "metric",
        units: { height: "cm", weight: "kg" },
      });
      expect(JSON.parse(bobResult.text)).toMatchObject({
        measurement_system: "us",
        units: { height: "in", weight: "lbs" },
      });
    });

    it("serves initialize, tools/list and catalog tools without touching the database", async () => {
      signInAs("user_alice");
      const { app, servicesUserIds } = createTestApp();
      const token = clerkToken("user_alice");

      const initialized = await initialize(app, token);
      const tools = await listTools(app, token);
      const ping = await callTool(app, "ping", token);
      const responses = [initialized, tools, ping];

      expect(responses.map((response) => response.status)).toStrictEqual([
        200, 200, 200,
      ]);
      const pingResult = await readToolResult(ping);

      expect(pingResult.isError).toBeFalsy();
      expect(servicesUserIds).toStrictEqual([]);
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
      expect(result.isError).toBeTruthy();
      expect(result.text).toContain("not configured");
    });

    it("reports a missing LIBRARY_URL or LIBRARY_MCP_SECRET as a tool error", async () => {
      signInAs("user_alice");
      // the old names configure nothing
      vi.stubEnv("EXERCISES_URL", "https://library.test");
      vi.stubEnv("EXERCISES_MCP_SECRET", "x".repeat(32));
      vi.stubEnv("LIBRARY_URL", "https://library.test");
      vi.stubEnv("LIBRARY_MCP_SECRET", "");

      const app = createApp({
        logRequests: false,
        reportError: ignoreReports,
      });

      const response = await callTool(
        app,
        "list_exercises",
        clerkToken("user_alice")
      );

      expect(response.status).toBe(200);
      const result = await readToolResult(response);
      expect(result.isError).toBeTruthy();
      expect(result.text).toBe(
        "This MCP server is not configured for the Library (LIBRARY_URL or LIBRARY_MCP_SECRET is missing)."
      );
    });

    // Stateless: there is no server-initiated SSE stream to open and no session
    // to terminate, so every method but POST is refused at once. Letting the SDK
    // handle a GET left the stream (and the Vercel function) open until the
    // 300 s timeout (FIT-469).
    it.each(["GET", "DELETE", "PUT", "PATCH"])(
      "answers %s with 405 and Allow: POST",
      async (method) => {
        signInAs("user_alice");
        const { app, reported } = createTestApp();

        const response = await requestMethod(
          app,
          method,
          clerkToken("user_alice")
        );

        // The status first: before the fix a GET answered 200 with an SSE stream
        // that never ends, so reading the body would hang the test.
        expect(response.status).toBe(405);
        expect(response.headers.get("Allow")).toBe("POST");
        await expect(response.json()).resolves.toMatchObject({
          error: { code: "method_not_allowed" },
        });
        expect(reported).toStrictEqual([]);
      }
    );

    // `refuseNonPost` runs before `answerUnsupportedProtocolVersion` (FIT-561):
    // the client that opened these streams is the one negotiating a newer
    // revision, and the spec tells it to expect a 405 for the stream, not a
    // version error.
    it("answers GET with 405 even on an unsupported protocol version", async () => {
      signInAs("user_alice");
      const { app, reported } = createTestApp();

      const response = await requestMethod(
        app,
        "GET",
        clerkToken("user_alice"),
        {
          "Mcp-Protocol-Version": "2026-07-28",
        }
      );

      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
      expect(reported).toStrictEqual([]);
    });
  });

  describe("protocol version", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("answers an unsupported version as the transport would, never reaching it", async () => {
      signInAs("user_alice");
      const { app, reported } = createTestApp();
      const expected = await transportAnswer(toolsListOn(UNSUPPORTED_VERSION));

      const handleRequest = vi.spyOn(
        WebStandardStreamableHTTPServerTransport.prototype,
        "handleRequest"
      );

      const response = await app.request(toolsListOn(UNSUPPORTED_VERSION));

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toBe(
        expected.headers.get("Content-Type")
      );
      const body = await response.json();
      expect(body).toStrictEqual(await expected.json());
      expect(body).toMatchObject({
        error: {
          message: expect.stringContaining(
            `Unsupported protocol version: ${UNSUPPORTED_VERSION}`
          ),
        },
      });
      // Sentry's MCP integration reports every error the transport raises
      expect({ calls: handleRequest.mock.calls, reported }).toStrictEqual({
        calls: [],
        reported: [],
      });
    });

    it("leaves a batch over the transport's limit to the transport", async () => {
      signInAs("user_alice");
      const { app } = createTestApp();

      const expected = await transportAnswer(oversizedBatch());

      const response = await app.request(oversizedBatch());

      await expect(response.json()).resolves.toStrictEqual(
        await expected.json()
      );
      expect(response.status).toBe(expected.status);
    });

    it("leaves a body over the transport's size limit to the transport", async () => {
      signInAs("user_alice");
      const { app } = createTestApp();

      const expected = await transportAnswer(oversized(UNSUPPORTED_VERSION));

      const response = await app.request(oversized(UNSUPPORTED_VERSION));

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toStrictEqual(
        await expected.json()
      );
    });

    it.each([
      ["alone", (request: JSONRPCRequest) => request],
      ["in a batch", (request: JSONRPCRequest) => [request]],
    ])(
      "lets the SDK negotiate an initialize request %s, whatever the header says",
      async (_, wrap) => {
        signInAs("user_alice");
        const { app } = createTestApp();

        const response = await app.request("/", {
          body: JSON.stringify(
            wrap({
              id: 1,
              jsonrpc: "2.0",
              method: "initialize",
              params: {
                capabilities: {},
                clientInfo: { name: "test", version: "0.0.0" },
                protocolVersion: UNSUPPORTED_VERSION,
              },
            })
          ),
          headers: {
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${clerkToken("user_alice")}`,
            "Content-Type": "application/json",
            "Mcp-Protocol-Version": UNSUPPORTED_VERSION,
          },
          method: "POST",
        });

        expect(response.status).toBe(200);
        await expect(response.text()).resolves.toContain(
          `"protocolVersion":"${LATEST_PROTOCOL_VERSION}"`
        );
      }
    );

    it.each(SUPPORTED_PROTOCOL_VERSIONS)(
      "serves a request on %s",
      async (version) => {
        signInAs("user_alice");
        const { app } = createTestApp();

        const response = await app.request(toolsListOn(version));

        expect(response.status).toBe(200);
      }
    );
  });

  describe("observability", () => {
    it("identifies the verified Clerk User, never one from tool input", async () => {
      signInAs("user_alice");
      const { app, identifiedUserIds } = createTestApp();

      await callTool(app, "get_profile", clerkToken("user_alice"), {
        userId: "user_mallory",
      });

      expect(identifiedUserIds).toStrictEqual(["user_alice"]);
    });

    it("neither identifies nor reports a rejected token", async () => {
      rejectToken();
      const { app, identifiedUserIds, reported } = createTestApp();

      const response = await listTools(app, "oat_expired");

      expect(response.status).toBe(401);
      expect(identifiedUserIds).toStrictEqual([]);
      expect(reported).toStrictEqual([]);
    });

    it("reports an unhandled error and answers a JSON 500", async () => {
      signInAs("user_alice");

      const crash = new Error("Identification failed");
      const { reportError, reported } = recordingReporter();

      const app = createApp({
        identifyUser: () => {
          throw crash;
        },
        logRequests: false,
        reportError,
      });

      const response = await listTools(app, clerkToken("user_alice"));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toStrictEqual({
        error: { code: "internal_error", message: "Internal server error" },
      });
      expect(reported).toStrictEqual([crash]);
    });
  });
});
