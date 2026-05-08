import { withSupabase } from "npm:@supabase/server";

const HANDLED_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
]);

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    const authHeader = req.headers.get("Authorization");
    const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

    if (!secret || authHeader !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const event = body?.event as Record<string, unknown> | undefined;
    const eventType = event?.type as string | undefined;

    if (!(eventType && HANDLED_EVENTS.has(eventType))) {
      return Response.json({ received: true });
    }

    const appUserId = event?.app_user_id as string | undefined;
    if (!appUserId) {
      console.error("Missing app_user_id in RevenueCat event", { eventType });
      return Response.json({ received: true });
    }

    const { data: profile, error } = await ctx.supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("user_id", appUserId)
      .single();

    if (error || !profile) {
      console.error(
        `RevenueCat webhook: no profile found for user_id=${appUserId}`,
        { eventType, error: error?.message }
      );
      // Still return 200 so RevenueCat does not retry
      return Response.json({ received: true });
    }

    console.log(
      `RevenueCat webhook: processed event=${eventType} for user=${profile.user_id}`
    );

    return Response.json({ received: true });
  }),
};
