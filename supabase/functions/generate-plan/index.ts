import { createClient } from "jsr:@supabase/supabase-js@2";

// Generate plan: runs AI generation for a plan that was already created,
// inserting workouts/exercises/sets into the DB and setting is_generating = false.
// The actual AI integration should be ported from the Laravel backend.

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

  const { id: planId } = await req.json();

  if (!planId) {
    return new Response(JSON.stringify({ error: "Missing plan id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify ownership
  const { data: plan, error: planError } = await supabaseClient
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", user.id)
    .single();

  if (planError || !plan) {
    return new Response(JSON.stringify({ error: "Plan not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Set is_generating = true
  await supabaseClient
    .from("plans")
    .update({ is_generating: true })
    .eq("id", planId);

  // TODO: Port AI workout generation logic from the Laravel backend.
  // After generation, insert workouts/exercises/sets and set is_generating = false.
  //
  // Example flow:
  // 1. Call AI API to generate workout plan based on plan parameters
  // 2. Insert workouts: supabaseClient.from("workouts").insert([...])
  // 3. Insert workout_exercises and workout_exercise_sets for each workout
  // 4. Set is_generating = false

  // Revert is_generating for now until AI is implemented
  await supabaseClient
    .from("plans")
    .update({ is_generating: false })
    .eq("id", planId);

  return new Response(
    JSON.stringify({ error: "AI integration not yet configured" }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
});
