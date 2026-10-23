import { observeHono, reportError } from "@fitme/observability/node";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { v1 } from "./routes/v1.js";
import { invalidRequest } from "./schemas.js";

export interface AppDeps {
  /** Reports an unhandled error before the 500 goes out. */
  reportError: (error: unknown) => Promise<void>;
}

/** The real dependencies: @fitme/observability's reporter. */
const defaultDeps = (): AppDeps => ({ reportError });

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

export const createApp = ({ reportError: report }: AppDeps = defaultDeps()) => {
  // Invalid input on any route answers 400 invalid_request unless the route
  // says otherwise.
  const app = new OpenAPIHono({ defaultHook: invalidRequest });

  // First, so the request span covers every other middleware
  app.use(observeHono(app));
  app.use(logger());
  app.use(cors({ origin: "*" }));

  app.openapi(health, (c) => c.json({ ok: true }, 200));

  app.route("/v1", v1);

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
