import { createClient } from "jsr:@supabase/supabase-js@2";

// Preview plan: generates a plan structure using AI without persisting it.
// The actual AI integration should be ported from the Laravel backend.
// This stub returns a structured error until the AI integration is configured.

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();

  // TODO: Port AI plan generation logic from the Laravel backend.
  // The body contains: { goal, place, frequency, experience_level, workout_duration, note? }
  // Expected return shape: PlanData (see lib/models.ts)
  //
  // Example integration with OpenAI:
  // const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  // const response = await fetch("https://api.openai.com/v1/chat/completions", {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({ model: "gpt-4o", messages: [...] }),
  // });
  // const data = await response.json();
  // return new Response(JSON.stringify(parsedPlanData), { status: 200, headers: { "Content-Type": "application/json" } });

  return new Response(
    JSON.stringify({ error: "AI integration not yet configured" }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
});
