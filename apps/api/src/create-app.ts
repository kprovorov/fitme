import { observeHono, reportError } from "@fitme/observability/node";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { v1 } from "./routes/v1.js";

export interface AppDeps {
  /** Reports an unhandled error before the 500 goes out. */
  reportError: (error: unknown) => Promise<void>;
}

/** The real dependencies: @fitme/observability's reporter. */
const defaultDeps = (): AppDeps => ({ reportError });

export const createApp = ({ reportError: report }: AppDeps = defaultDeps()) => {
  const app = new Hono();

  // First, so the request span covers every other middleware
  app.use(observeHono(app));
  app.use(logger());
  app.use(cors({ origin: "*" }));

  app.get("/health", (c) => c.json({ ok: true }));

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
