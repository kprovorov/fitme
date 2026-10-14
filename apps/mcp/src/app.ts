import { clerkMiddleware } from "@clerk/hono";
import { streamableHttpHandler } from "@clerk/mcp-tools/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  type AuthVariables,
  PROTECTED_RESOURCE_METADATA_PATH,
  protectedResourceMetadata,
  requireBearerToken,
  requireClerkUser,
  requireConfig,
} from "./auth.js";
import { createToolContext } from "./context.js";
import { createMcpServer } from "./server.js";
import type { ServicesFactory } from "./services.js";
import type { SupabaseClientFactory } from "./supabase.js";

export interface CreateAppOptions {
  /** Overrides the services on `FITME_DATABASE_URL` (used by tests). */
  createServices?: ServicesFactory;
  /** Overrides the env-based Supabase client (used by tests). */
  createSupabaseClient?: SupabaseClientFactory;
  logRequests?: boolean;
}

export function createApp({
  createServices,
  createSupabaseClient,
  logRequests = true,
}: CreateAppOptions = {}) {
  const app = new Hono<{ Variables: AuthVariables }>();

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

  // Public: liveness and OAuth discovery.
  app.get("/health", (c) => c.json({ ok: true }));
  app.get(PROTECTED_RESOURCE_METADATA_PATH, protectedResourceMetadata);

  // The MCP endpoint lives at the root so the server is reachable directly at
  // https://mcp.fitmeproject.com. Every method needs a Clerk OAuth token.
  app.use(
    "/",
    requireConfig,
    requireBearerToken,
    clerkMiddleware(),
    requireClerkUser
  );

  // Stateless streamable HTTP: a fresh server + transport per request, so the
  // process can scale without sticky sessions.
  app.all("/", (c) => {
    const context = createToolContext({
      createServices,
      createSupabaseClient,
      signToken: c.get("signToken"),
      user: c.get("clerkUser"),
    });
    return streamableHttpHandler(() => createMcpServer({ context }))(c);
  });

  return app;
}

// Vercel's Hono preset serves the default export of dist/app.js.
export default createApp();
