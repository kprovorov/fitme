import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createMcpServer } from "./server.js";
import type { SupabaseClientFactory } from "./supabase.js";

const BEARER_TOKEN = /^Bearer\s+(\S+)\s*$/i;

/** Supabase user access token from `Authorization: Bearer <token>`, if any. */
export const extractBearerToken = (header: string | undefined) =>
  header?.match(BEARER_TOKEN)?.[1] ?? null;

export interface CreateAppOptions {
  /** Overrides the env-based Supabase client (used by tests). */
  createSupabaseClient?: SupabaseClientFactory;
  logRequests?: boolean;
}

export function createApp({
  createSupabaseClient,
  logRequests = true,
}: CreateAppOptions = {}) {
  const app = new Hono();

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
      exposeHeaders: ["Mcp-Session-Id"],
      origin: "*",
    })
  );

  app.get("/health", (c) => c.json({ ok: true }));

  // The MCP endpoint lives at the root so the server is reachable directly at
  // https://mcp.fitmeproject.com. Stateless streamable HTTP: a fresh server +
  // transport per request, so the process can scale without sticky sessions.
  // The caller's bearer token (if any) scopes the user tools to that user.
  app.all("/", async (c) => {
    const server = createMcpServer({
      accessToken: extractBearerToken(c.req.header("Authorization")),
      createSupabaseClient,
    });
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
