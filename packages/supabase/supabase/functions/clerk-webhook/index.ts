import * as Sentry from "npm:@sentry/deno@^11";
import { withSupabase } from "npm:@supabase/server";
import { createClerkWebhookHandler } from "./handler.ts";

// Clerk calls this with Svix-signed events, never a Supabase token, so the
// gateway's verify_jwt is off and the handler checks the signature itself.

// Without SENTRY_DSN, Sentry stays disabled and failures only reach the logs.
// The default integrations patch Deno.serve, which the edge runtime owns.
Sentry.init({
  defaultIntegrations: false,
  dsn: Deno.env.get("SENTRY_DSN"),
});
Sentry.setTag("function", "clerk-webhook");
Sentry.setTag("region", Deno.env.get("SB_REGION"));

const FLUSH_TIMEOUT_MS = 2000;

async function reportError(error: unknown): Promise<void> {
  console.error(error);
  Sentry.captureException(error);
  await Sentry.flush(FLUSH_TIMEOUT_MS);
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const signingSecret = Deno.env.get("CLERK_WEBHOOK_SIGNING_SECRET");
    if (!signingSecret) {
      // Every delivery fails until the secret is set; Clerk keeps retrying
      await reportError(new Error("Missing CLERK_WEBHOOK_SIGNING_SECRET"));
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }

    const handler = createClerkWebhookHandler({
      deleteUserData: async (userId) => {
        const { error } = await ctx.supabaseAdmin.rpc("delete_user_data", {
          user_id: userId,
        });
        if (error) {
          throw new Error(`delete_user_data failed for ${userId}`, {
            cause: error,
          });
        }
      },
      reportError,
      signingSecret,
    });
    return await handler(req);
  }),
};
