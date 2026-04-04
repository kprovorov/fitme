import { createClient } from "jsr:@supabase/supabase-js@2";

const SEGMENT_TRACK_URL = "https://api.segment.io/v1/track";

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey,
  );

  const { data: abandonedSessions, error: queryError } = await adminClient
    .from("workout_sessions")
    .select("id, workout_id, workouts!inner(plan_id, plans!inner(user_id))")
    .is("finished_at", null)
    .lt("started_at", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());

  if (queryError) {
    console.error("Failed to query abandoned sessions:", queryError);
    return new Response(JSON.stringify({ error: queryError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!abandonedSessions || abandonedSessions.length === 0) {
    return new Response(JSON.stringify({ finished: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const segmentWriteKey = Deno.env.get("SEGMENT_WRITE_KEY") ?? "";
  const segmentAuth = btoa(`${segmentWriteKey}:`);

  let finished = 0;

  for (const session of abandonedSessions) {
    const workout = session.workouts as {
      plan_id: string;
      plans: { user_id: string };
    };
    const userId = workout.plans.user_id;
    const planId = workout.plan_id;

    const { error: rpcError } = await adminClient.rpc(
      "finish_workout_session",
      { p_session_id: session.id },
    );

    if (rpcError) {
      console.error(`Failed to finish session ${session.id}:`, rpcError);
      continue;
    }

    if (segmentWriteKey) {
      const segmentRes = await fetch(SEGMENT_TRACK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${segmentAuth}`,
        },
        body: JSON.stringify({
          userId,
          event: "Workout Completed",
          properties: {
            workout_id: session.workout_id,
            plan_id: planId,
            auto_finished: true,
          },
        }),
      });

      if (!segmentRes.ok) {
        console.warn(
          `Segment track failed for session ${session.id}:`,
          await segmentRes.text(),
        );
      }
    }

    finished++;
  }

  return new Response(JSON.stringify({ finished }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
