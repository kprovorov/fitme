import {
  identifyUser,
  observeHono,
  reportError,
} from "@fitme/observability/node";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { ErrorHandler } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { BEARER_AUTH, requireCaller } from "./auth.js";
import type { ApiEnv } from "./auth.js";
import { exerciseLibraryFromEnv } from "./exercise-library.js";
import type { LibraryV2 } from "./exercise-library.js";
import { libraryIndexFromEnv } from "./library.js";
import type { LibraryIndex } from "./library.js";
import { rateLimitCallers, rateLimiterFromEnv } from "./rate-limit.js";
import type { RateLimiter } from "./rate-limit.js";
import { publicV1, userV1 } from "./routes/v1.js";
import { invalidRequest } from "./schemas.js";
import { createServicesFromEnv } from "./services.js";
import type { ServicesFactory } from "./services.js";

export interface AppDeps {
  /** The Clerk instance's PEM public key session tokens are verified against. */
  clerkJwtKey: string | undefined;
  /**
   * The new Library the Exercise routes read (ADR 0022;
   * `exerciseLibraryFromEnv` over `reportError` unless given).
   */
  exerciseLibrary: LibraryV2;
  /** Builds a verified User's services; `null` when the database isn't configured. */
  createServices: ServicesFactory;
  /** Sets the request's User (their Clerk id only) on what error reporting sends. */
  identifyUser: (userId: string) => void;
  /**
   * The Library index writes check their Exercise slugs and pick Covers
   * against (`libraryIndexFromEnv` over `reportError` unless given).
   */
  libraryIndex: LibraryIndex;
  /** Counts each caller's requests (`rateLimiterFromEnv` unless given). */
  rateLimiter: RateLimiter;
  /** Reports an unhandled error before the 500 goes out. */
  reportError: typeof reportError;
}

/**
 * The real dependencies: the environment and @fitme/observability. The rate
 * limiter is built only when none is given (it throws in production without
 * Upstash), and the Library index and the new Library over the reporter in
 * use.
 */
const defaultDeps = (): Omit<
  AppDeps,
  "exerciseLibrary" | "libraryIndex" | "rateLimiter"
> => ({
  clerkJwtKey: process.env.CLERK_JWT_KEY,
  createServices: createServicesFromEnv,
  identifyUser,
  reportError,
});

const health = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.boolean() }) },
      },
      description: "The API is up",
    },
  },
  summary: "Liveness",
});

export const createApp = (deps: Partial<AppDeps> = {}) => {
  const {
    clerkJwtKey,
    createServices,
    identifyUser: identify,
    reportError: report,
  } = { ...defaultDeps(), ...deps };

  const rateLimiter = deps.rateLimiter ?? rateLimiterFromEnv(process.env);
  // One per instance, loaded on the first write that asks (ADR 0018).
  const libraryIndex = deps.libraryIndex ?? libraryIndexFromEnv(report);

  // One per instance, loaded on the first Exercise read and kept (ADR 0022).
  const exerciseLibrary =
    deps.exerciseLibrary ?? exerciseLibraryFromEnv(report);

  // Invalid input on any route answers 400 invalid_request unless the route
  // says otherwise.
  const app = new OpenAPIHono<ApiEnv>({ defaultHook: invalidRequest });

  // First, so the request span covers every other middleware
  app.use(observeHono(app));
  app.use(logger());
  // Before auth: a browser's preflight carries no token, so it's answered
  // here, and every response, a 401 included, is readable cross-origin.
  // Callers authenticate with a bearer token, never cookies, so any origin is
  // fine.
  app.use(cors({ origin: "*" }));

  // Registered before auth, so they answer without a token.
  app.openapi(health, (c) => c.json({ ok: true }, 200));
  app.route("/v1", publicV1);

  // Every route from here on (unknown ones too) needs a verified caller.
  app.use(requireCaller({ clerkJwtKey, createServices }));
  // Error reporting knows the User by their Clerk id only. Routes get the
  // Library index, the new Library and the reporter for the answers they give
  // themselves.
  app.use(async (c, next) => {
    identify(c.var.caller.userId);
    c.set("exerciseLibrary", exerciseLibrary);
    c.set("libraryIndex", libraryIndex);
    c.set("reportError", report);

    await next();
  });
  // Before anything is served, unknown routes included.
  app.use(rateLimitCallers({ limiter: rateLimiter, reportError: report }));
  app.openAPIRegistry.registerComponent("securitySchemes", BEARER_AUTH, {
    description: "The User's Clerk session token",
    scheme: "bearer",
    type: "http",
  });
  app.route("/v1", userV1);

  app.notFound((c) =>
    c.json({ error: { code: "not_found", message: "Route not found" } }, 404)
  );

  const handleError: ErrorHandler<ApiEnv> = async (error, c) => {
    if (error instanceof HTTPException) {
      return c.json(
        { error: { code: "http_error", message: error.message } },
        error.status
      );
    }

    await report(error);

    return c.json(
      { error: { code: "internal_error", message: "Internal server error" } },
      500
    );
  };

  app.onError(handleError);

  return app;
};
