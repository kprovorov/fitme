import { streamableHttpHandler } from "@clerk/mcp-tools/hono";
import {
  identifyUser as identifyObservedUser,
  observeHono,
  reportError as reportToObservability,
} from "@fitme/observability/node";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import {
  type AuthVariables,
  PROTECTED_RESOURCE_METADATA_PATH,
  protectedResourceMetadata,
  requireBearerToken,
  requireClerkUser,
  requireConfig,
  verifyClerkToken,
} from "./auth.js";
import { createToolContext, type ReportError } from "./context.js";
import type { ExerciseLibraryFactory } from "./exercise-library.js";
import { createMcpServer } from "./server.js";
import type { ServicesFactory } from "./services.js";

export interface CreateAppOptions {
  /**
   * Overrides the Exercise Library API on `EXERCISES_URL` (used by tests).
   */
  createExerciseLibrary?: ExerciseLibraryFactory;
  /** Overrides the services on `FITME_DATABASE_URL` (used by tests). */
  createServices?: ServicesFactory;
  /**
   * Sets the request's User for error reports and traces; called with the
   * verified Clerk id only. Defaults to @fitme/observability's.
   */
  identifyUser?: (userId: string) => void;
  logRequests?: boolean;
  /**
   * Reports an unexpected failure: unhandled errors on the endpoint and tools
   * whose service call fails unexpectedly.
   */
  reportError: ReportError;
}

export function createApp({
  createExerciseLibrary,
  createServices,
  identifyUser = identifyObservedUser,
  logRequests = true,
  reportError,
}: CreateAppOptions) {
  const app = new Hono<{ Variables: AuthVariables }>();

  // First, so the request span covers every other middleware
  app.use(observeHono(app));
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
    verifyClerkToken,
    requireClerkUser,
    async (c, next) => {
      identifyUser(c.get("clerkUser").userId);
      await next();
    }
  );

  // Stateless streamable HTTP: a fresh server + transport per request, so the
  // process can scale without sticky sessions.
  app.all("/", (c) => {
    const context = createToolContext({
      createExerciseLibrary,
      createServices,
      reportError,
      user: c.get("clerkUser"),
    });
    return streamableHttpHandler(() => createMcpServer({ context }))(c);
  });

  app.onError(async (error, c) => {
    if (error instanceof HTTPException) {
      return c.json(
        { error: { code: "http_error", message: error.message } },
        error.status
      );
    }
    await reportError(error);
    return c.json(
      { error: { code: "internal_error", message: "Internal server error" } },
      500
    );
  });

  return app;
}

/** The app with the real reporter, for the Vercel entry and `pnpm start`. */
export const createDefaultApp = () =>
  createApp({ reportError: reportToObservability });
