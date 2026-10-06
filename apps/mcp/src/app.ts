import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  authenticate,
  callsUserTool,
  PROTECTED_RESOURCE_METADATA_PATH,
  protectedResourceMetadata,
  resourceUrl,
  unauthorizedResponse,
} from "./auth.js";
import { createToolContext } from "./context.js";
import { createMcpServer } from "./server.js";
import {
  authorizationServerFromEnv,
  type SupabaseClientFactory,
} from "./supabase.js";

const BEARER_TOKEN = /^Bearer\s+(\S+)\s*$/i;

/** Supabase user access token from `Authorization: Bearer <token>`, if any. */
export const extractBearerToken = (header: string | undefined) =>
  header?.match(BEARER_TOKEN)?.[1] ?? null;

/** The JSON body of a request, without consuming it for the transport. */
async function peekJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    // Not JSON: the transport answers with a proper JSON-RPC parse error.
    return undefined;
  }
}

export interface CreateAppOptions {
  /**
   * OAuth authorization server issuer. Defaults to Supabase Auth from
   * SUPABASE_URL; `null` turns OAuth off (user tools then answer
   * unauthenticated calls with a tool error instead of HTTP 401).
   */
  authorizationServer?: string | null;
  /** Overrides the env-based Supabase client (used by tests). */
  createSupabaseClient?: SupabaseClientFactory;
  logRequests?: boolean;
}

export function createApp({
  authorizationServer,
  createSupabaseClient,
  logRequests = true,
}: CreateAppOptions = {}) {
  const app = new Hono();
  const getAuthorizationServer = () =>
    authorizationServer === undefined
      ? authorizationServerFromEnv()
      : authorizationServer;
  const getResourceUrl = (requestUrl: string) =>
    resourceUrl(requestUrl, process.env.MCP_PUBLIC_URL);

  if (logRequests) {
    app.use(logger());
  }
  app.use(
    cors({
      allowHeaders: [
        "Authorization",
        "Content-Type",
        "Accept",
        "Mcp-Session-Id",
        "Mcp-Protocol-Version",
      ],
      exposeHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
      origin: "*",
    })
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.get(PROTECTED_RESOURCE_METADATA_PATH, (c) => {
    const issuer = getAuthorizationServer();
    if (!issuer) {
      return c.json(
        {
          error: {
            code: "not_configured",
            message: "OAuth is not configured on this server.",
          },
        },
        404
      );
    }
    return c.json(protectedResourceMetadata(getResourceUrl(c.req.url), issuer));
  });

  // The MCP endpoint lives at the root so the server is reachable directly at
  // https://mcp.fitmeproject.com. Stateless streamable HTTP: a fresh server +
  // transport per request, so the process can scale without sticky sessions.
  // The caller's bearer token (if any) scopes the user tools to that user.
  app.all("/", async (c) => {
    const context = createToolContext({
      accessToken: extractBearerToken(c.req.header("Authorization")),
      createSupabaseClient,
    });

    // Calls to user tools need a valid token: answer 401 so the client runs
    // (or refreshes) OAuth. Public tools and discovery stay anonymous.
    if (
      c.req.method === "POST" &&
      getAuthorizationServer() &&
      callsUserTool(await peekJsonBody(c.req.raw))
    ) {
      const failure = await authenticate(context);
      if (failure) {
        const metadataUrl = new URL(
          PROTECTED_RESOURCE_METADATA_PATH,
          getResourceUrl(c.req.url)
        ).href;
        return unauthorizedResponse(failure, metadataUrl);
      }
    }

    const server = createMcpServer({ context });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return app;
}

// Vercel's Hono preset serves the default export of dist/app.js.
export default createApp();
