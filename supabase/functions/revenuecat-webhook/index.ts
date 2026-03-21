import { createClient } from "jsr:@supabase/supabase-js@2";

const HANDLED_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
]);

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

  if (!secret || authHeader !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = body?.event as Record<string, unknown> | undefined;
  const eventType = event?.type as string | undefined;

  if (!eventType || !HANDLED_EVENTS.has(eventType)) {
    // Acknowledge unhandled event types without processing
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const appUserId = event?.app_user_id as string | undefined;
  if (!appUserId) {
    console.error("Missing app_user_id in RevenueCat event", { eventType });
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: profile, error } = await serviceClient
    .from("profiles")
    .select("user_id")
    .eq("user_id", appUserId)
    .single();

  if (error || !profile) {
    console.error(
      `RevenueCat webhook: no profile found for user_id=${appUserId}`,
      { eventType, error: error?.message },
    );
    // Still return 200 so RevenueCat does not retry
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(
    `RevenueCat webhook: processed event=${eventType} for user=${profile.user_id}`,
  );

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
