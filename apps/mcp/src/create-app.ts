import { clerkMiddleware } from "@clerk/hono";
import { streamableHttpHandler } from "@clerk/mcp-tools/hono";
import {
  identifyUser as identifyObservedUser,
  observeHono,
  reportError as reportToObservability,
} from "@fitme/observability/node";
import { Hono } from "hono";
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import {
  PROTECTED_RESOURCE_METADATA_PATH,
  protectedResourceMetadata,
  requireBearerToken,
  requireClerkUser,
  requireConfig,
} from "./auth.js";
import type { AuthVariables } from "./auth.js";
import { createToolContext } from "./context.js";
import type { ReportError } from "./context.js";
import type { LibraryFactory } from "./library.js";
import { answerUnsupportedProtocolVersion } from "./protocol-version.js";
import { createMcpServer } from "./server.js";
import type { ServicesFactory } from "./services.js";

export interface CreateAppOptions {
  /**
   * Overrides the Library API on `LIBRARY_URL` (used by tests).
   */
  createLibrary?: LibraryFactory;
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

/**
 * Answers every method but POST with 405 and `Allow: POST`. The endpoint is
 * stateless (`sessionIdGenerator: undefined`), so there is no server-initiated
 * SSE stream for a GET to open and no session for a DELETE to terminate; the
 * SDK transport would answer a GET with a keep-alive stream nothing ever
 * closes, which held the Vercel function open until its 300 s timeout
 * (FIT-469). It answers directly rather than throwing an `HTTPException`,
 * which would lose the `Allow` header in `onError`, and runs before
 * `answerUnsupportedProtocolVersion`, so a client on a newer revision gets the
 * 405 the spec tells it to expect for the stream rather than a version error.
 */
const refuseNonPost: MiddlewareHandler = async (c, next) => {
  if (c.req.method === "POST") {
    await next();

    return;
  }

  return c.json(
    {
      error: {
        code: "method_not_allowed",
        message: "The MCP endpoint accepts POST only.",
      },
    },
    405,
    { Allow: "POST" }
  );
};

export const createApp = ({
  createLibrary,
  createServices,
  identifyUser = identifyObservedUser,
  logRequests = true,
  reportError,
}: CreateAppOptions) => {
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

  // Public: liveness, OAuth discovery and OpenAI's domain verification.
  app.get("/health", (c) => c.json({ ok: true }));
  app.get(PROTECTED_RESOURCE_METADATA_PATH, protectedResourceMetadata);
  // OpenAI's Apps SDK domain verification token (public), from the env; 404
  // while it's unset.
  app.get("/.well-known/openai-apps-challenge", (c) => {
    const challenge = process.env.OPENAI_APPS_CHALLENGE?.trim();

    return challenge ? c.text(challenge) : c.notFound();
  });

  // The MCP endpoint lives at the root so the server is reachable directly at
  // https://mcp.fitmeproject.com. Every method needs a Clerk OAuth token.
  app.use(
    "/",
    requireConfig,
    requireBearerToken,
    clerkMiddleware(),
    requireClerkUser,
    async (c, next) => {
      identifyUser(c.get("clerkUser").userId);

      await next();
    },
    refuseNonPost,
    answerUnsupportedProtocolVersion
  );

  // Stateless streamable HTTP: a fresh server + transport per request, so the
  // process can scale without sticky sessions.
  app.post("/", (c) => {
    const context = createToolContext({
      createLibrary,
      createServices,
      reportError,
      user: c.get("clerkUser"),
    });

    return streamableHttpHandler(() => createMcpServer({ context }))(c);
  });

  const handleError: ErrorHandler = async (error, c) => {
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
  };

  app.onError(handleError);

  return app;
};

/** The app with the real reporter, for the Vercel entry and `pnpm start`. */
export const createDefaultApp = () =>
  createApp({ reportError: reportToObservability });
