import { withService } from "@fitme/db";
import { observeHono, reportError } from "@fitme/observability/node";
import { listArnoldSessionIds } from "@fitme/services/arnold-sessions";
import { deleteUserData } from "@fitme/services/delete-user-data";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import {
  arnoldResetConfig,
  arnoldSessionResetter,
  deleteArnoldConversations,
} from "./arnold.js";
import { type ClerkWebhookDeps, clerkRoutes } from "./routes/clerk.js";

export interface AppDeps {
  clerk: Omit<ClerkWebhookDeps, "reportError">;
  /** Reports a failure; every route and the error handler share it. */
  reportError: ClerkWebhookDeps["reportError"];
}

/**
 * The real dependencies: the database through withService, Arnold,
 * @fitme/observability, env. The Arnold session ids are read in withService:
 * by then the User's id is retired, so asUser would see none.
 */
const defaultDeps = (): AppDeps => ({
  clerk: {
    deleteArnoldConversations: deleteArnoldConversations({
      listSessionIds: (userId) =>
        withService((tx) => listArnoldSessionIds(tx, userId)),
      resetSession: arnoldSessionResetter(arnoldResetConfig(process.env)),
    }),
    deleteUserData: (userId) => withService((tx) => deleteUserData(tx, userId)),
    signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  },
  reportError,
});

/**
 * Receives third-party webhooks. Each sender gets its own route, which
 * verifies the sender's signature itself; only /health is unsigned.
 */
export const createApp = (
  { clerk, reportError: report }: AppDeps = defaultDeps()
) => {
  const app = new Hono();

  // First, so the request span covers every other middleware
  app.use(observeHono(app));
  app.use(logger());

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/clerk", clerkRoutes({ ...clerk, reportError: report }));

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
