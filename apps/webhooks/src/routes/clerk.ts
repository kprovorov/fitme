import { verifyWebhook, type WebhookEvent } from "@clerk/backend/webhooks";
import { Hono } from "hono";

export interface ClerkWebhookDeps {
  deleteUserData: (userId: string) => Promise<void>;
  reportError: (error: unknown) => Promise<void>;
  /** Unset fails every delivery with a reported 500, so Clerk keeps retrying. */
  signingSecret: string | undefined;
}

const errorBody = (code: string, message: string) => ({
  error: { code, message },
});

/**
 * Clerk's webhooks (Svix-signed). Only `user.deleted` acts: it wipes the
 * User's data. Every other event is acknowledged so Clerk doesn't retry it.
 * There is no svix-id dedupe: deleteUserData is idempotent.
 */
export const clerkRoutes = ({
  deleteUserData,
  reportError,
  signingSecret,
}: ClerkWebhookDeps) =>
  new Hono().post("/", async (c) => {
    if (!signingSecret) {
      await reportError(new Error("Missing CLERK_WEBHOOK_SIGNING_SECRET"));
      return c.json(errorBody("internal_error", "Internal server error"), 500);
    }

    // Verified on the raw request, before anything reads the body
    let event: WebhookEvent;
    try {
      event = await verifyWebhook(c.req.raw, { signingSecret });
    } catch {
      return c.json(errorBody("unauthorized", "Invalid signature"), 401);
    }

    if (event.type === "user.deleted" && event.data.id) {
      try {
        await deleteUserData(event.data.id);
      } catch (error) {
        await reportError(error);
        return c.json(
          errorBody("cleanup_failed", "User data cleanup failed"),
          500
        );
      }
    }

    return c.json({ received: true });
  });
