import { withService } from "@fitme/db";
import { deleteUserData } from "@fitme/services/delete-user-data";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { type ClerkWebhookDeps, clerkRoutes } from "./routes/clerk.js";
import { reportError } from "./sentry.js";

export interface AppDeps {
  clerk: ClerkWebhookDeps;
}

/** The real dependencies: the database through withService, Sentry, env. */
const defaultDeps = (): AppDeps => ({
  clerk: {
    deleteUserData: (userId) => withService((tx) => deleteUserData(tx, userId)),
    reportError,
    signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  },
});

/**
 * Receives third-party webhooks. Each sender gets its own route, which
 * verifies the sender's signature itself; only /health is unsigned.
 */
export const createApp = ({ clerk }: AppDeps = defaultDeps()) => {
  const app = new Hono();

  app.use(logger());

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/clerk", clerkRoutes(clerk));

  app.notFound((c) =>
    c.json({ error: { code: "not_found", message: "Route not found" } }, 404)
  );

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json(
        { error: { code: "http_error", message: error.message } },
        error.status
      );
    }
    console.error(error);
    return c.json(
      { error: { code: "internal_error", message: "Internal server error" } },
      500
    );
  });

  return app;
};

// Vercel's Hono preset serves the default export of dist/app.js.
export default createApp();
