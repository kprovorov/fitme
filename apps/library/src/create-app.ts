import { observeHono } from "@fitme/observability/node";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import {
  type AuthConfig,
  type AuthEnv,
  BEARER_AUTH,
  requireCaller,
} from "./auth";
import { deviceCache } from "./cache";
import { type RateLimiter, rateLimitUsers } from "./rate-limit";
import { exerciseRoutes } from "./routes/exercises";
import type { ServedLibrary } from "./served-library";

export interface AppDeps {
  /** The Clerk keys and server secrets a caller can prove who they are with. */
  auth: AuthConfig;
  /** Sets the request's User (their Clerk id) on what error reporting sends. */
  identifyUser: (userId: string) => void;
  /** The whole Exercise Library, baked into the build: nothing is read at runtime. */
  library: ServedLibrary;
  /** Counts each User's requests; server callers are never counted. */
  rateLimiter: RateLimiter;
  /** Sends an error to Sentry (and the logs), resolving once it's delivered. */
  reportError: (error: unknown) => Promise<void>;
}

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

/** The Exercise Library API, serving the injected Exercise Library. */
export const createApp = ({
  auth,
  identifyUser,
  library,
  rateLimiter,
  reportError,
}: AppDeps) => {
  const app = new OpenAPIHono<AuthEnv>();

  // First, so the request span covers every other middleware
  app.use(observeHono(app));
  app.use(logger());
  // Before auth (ADR 0007): a browser's preflight carries no token, so it's
  // answered here, and every response, a 401 included, is readable
  // cross-origin. Callers authenticate with a bearer token, never cookies, so
  // any origin is fine.
  app.use(cors({ origin: "*" }));

  // Registered before auth, so it answers without a token.
  app.openapi(health, (c) => c.json({ ok: true }, 200));

  // Every route from here on (unknown ones too) needs a caller.
  app.use(requireCaller(auth));
  // A User is known by their Clerk id only; a server caller is no User.
  app.use(async (c, next) => {
    const caller = c.get("caller");
    if (caller.type === "user") {
      identifyUser(caller.userId);
    }
    await next();
  });
  app.openAPIRegistry.registerComponent("securitySchemes", BEARER_AUTH, {
    description:
      "A Clerk session token, or the Public API's, Arnold's or the MCP server's secret",
    scheme: "bearer",
    type: "http",
  });
  // Counted before anything is served, a 304 included.
  app.use(rateLimitUsers({ limiter: rateLimiter, reportError }));

  // Every content route, current and future, lives under /exercises. After
  // auth, so a 304 only ever goes to a caller.
  app.use("/exercises/*", deviceCache(library.hash));
  app.route("/", exerciseRoutes(library));

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
    await reportError(error);
    return c.json(
      { error: { code: "internal_error", message: "Internal server error" } },
      500
    );
  });

  return app;
};
