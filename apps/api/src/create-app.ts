import type { ExerciseLibrary } from "@fitme/exercise-library";
import {
  identifyUser,
  observeHono,
  reportError,
} from "@fitme/observability/node";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { type ApiEnv, BEARER_AUTH, requireCaller } from "./auth.js";
import {
  createExerciseLibraryFromEnv,
  type ExerciseLibraryFactory,
} from "./exercise-library.js";
import {
  type RateLimiter,
  rateLimitCallers,
  rateLimiterFromEnv,
} from "./rate-limit.js";
import { publicV1, userV1 } from "./routes/v1.js";
import { invalidRequest } from "./schemas.js";
import { createServicesFromEnv, type ServicesFactory } from "./services.js";

export interface AppDeps {
  /** The Clerk instance's PEM public key session tokens are verified against. */
  clerkJwtKey: string | undefined;
  /** Builds the Exercise Library client; `null` when it isn't configured. */
  createExerciseLibrary: ExerciseLibraryFactory;
  /** Builds a verified User's services; `null` when the database isn't configured. */
  createServices: ServicesFactory;
  /** Sets the request's User (their Clerk id only) on what error reporting sends. */
  identifyUser: (userId: string) => void;
  /** Counts each caller's requests (`rateLimiterFromEnv` unless given). */
  rateLimiter: RateLimiter;
  /** Reports an unhandled error before the 500 goes out. */
  reportError: (error: unknown) => Promise<void>;
}

/**
 * The real dependencies: the environment and @fitme/observability. The rate
 * limiter is built only when none is given (it throws in production without
 * Upstash).
 */
const defaultDeps = (): Omit<AppDeps, "rateLimiter"> => ({
  clerkJwtKey: process.env.CLERK_JWT_KEY,
  createExerciseLibrary: createExerciseLibraryFromEnv,
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
    createExerciseLibrary,
    createServices,
    identifyUser: identify,
    reportError: report,
  } = { ...defaultDeps(), ...deps };
  const rateLimiter = deps.rateLimiter ?? rateLimiterFromEnv(process.env);

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
  // Built on first use, then shared by every request.
  let library: ExerciseLibrary | null | undefined;
  // Error reporting knows the User by their Clerk id only. Routes get the
  // Exercise Library and the reporter for the answers they give themselves.
  app.use(async (c, next) => {
    identify(c.var.caller.userId);
    c.set("getExerciseLibrary", () => {
      if (library === undefined) {
        library = createExerciseLibrary();
      }
      return library;
    });
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

  app.onError(async (error, c) => {
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
  });

  return app;
};
