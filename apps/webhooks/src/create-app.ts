import { withService } from "@fitme/db";
import { observeHono, reportError } from "@fitme/observability/node";
import { listCoachSessionIds } from "@fitme/services/coach-sessions";
import { deleteUserData } from "@fitme/services/delete-user-data";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { coachSessionResetter, deleteCoachConversations } from "./coach.js";
import { type ClerkWebhookDeps, clerkRoutes } from "./routes/clerk.js";

export interface AppDeps {
  clerk: Omit<ClerkWebhookDeps, "reportError">;
  /** Reports a failure; every route and the error handler share it. */
  reportError: ClerkWebhookDeps["reportError"];
}

/**
 * The real dependencies: the database through withService, the Coach,
 * @fitme/observability, env. The Coach session ids are read in withService: by then the User's
 * id is retired, so asUser would see none.
 */
const defaultDeps = (): AppDeps => ({
  clerk: {
    deleteCoachConversations: deleteCoachConversations({
      listSessionIds: (userId) =>
        withService((tx) => listCoachSessionIds(tx, userId)),
      resetSession: coachSessionResetter({
        coachUrl: process.env.COACH_URL,
        secret: process.env.COACH_RESET_SECRET,
      }),
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
