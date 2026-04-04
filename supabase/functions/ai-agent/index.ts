import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateText, jsonSchema, tool } from "npm:ai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { z } from "npm:zod";

// ─── Types ────────────────────────────────────────────────────────────────────

const WorkoutExerciseSetInputSchema = z.object({
  order: z.number(),
  weight_recommended: z.number(),
  reps_recommended: z.number(),
  rest_recommended: z.number(),
});

const WorkoutExerciseInputSchema = z.object({
  exercise_id: z.string().uuid(),
  order: z.number(),
  sets: z.array(WorkoutExerciseSetInputSchema).min(1),
});

const WorkoutInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  order: z.number(),
  exercises: z.array(WorkoutExerciseInputSchema).min(1),
});

const PlanInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  goal: z.enum([
    "muscle-gain",
    "fat-loss",
    "recomposition",
    "strength-performance",
    "general-health-fitness",
  ]),
  place: z.enum(["gym", "home"]),
  frequency: z.number().min(1).max(7),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]),
  workout_duration: z.number().min(30).max(120),
  note: z.string().optional(),
  workouts: z.array(WorkoutInputSchema).min(1),
});

// ─── Model selection ──────────────────────────────────────────────────────────

function getModel() {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic("claude-sonnet-4-6");
  }
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai("gpt-4o");
  }
  throw new Error(
    "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

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

  // Use service role client for writes that need to bypass RLS within tool execution
  const supabaseService = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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

  const body: { message: string; conversation_id?: string } = await req.json();
  const { message, conversation_id } = body;

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Get or create conversation ─────────────────────────────────────────────
  let conversationId = conversation_id;
  if (!conversationId) {
    const { data: newConv, error: convError } = await supabaseService
      .from("conversations")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    if (convError) throw convError;
    conversationId = newConv.id;
  }

  // ── Load message history (last 20) ─────────────────────────────────────────
  const { data: history } = await supabaseClient
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  const historyMessages = (history ?? []).map(
    (m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }),
  );

  // ── Build full messages array ───────────────────────────────────────────────
  const messages = [
    ...historyMessages,
    { role: "user" as const, content: message },
  ];

  // Track optional attachments for the response
  let attachmentResult:
    | { type: "plan_preview"; data: Record<string, unknown> }
    | undefined;

  // ── Define tools ───────────────────────────────────────────────────────────
  const tools = {
    get_active_plan: tool({
      description:
        "Get the user's currently active workout plan with all workouts and exercises",
      parameters: jsonSchema({ type: "object", properties: {} }),
      execute: async () => {
        const { data, error } = await supabaseClient
          .from("plans")
          .select(
            `*, workouts (
              *,
              exercises:workout_exercises (
                *,
                exercise:exercises (*),
                sets:workout_exercise_sets (*)
              )
            )`,
          )
          .eq("is_active", true)
          .is("deleted_at", null)
          .single();
        if (error) return { error: "No active plan found" };
        return data;
      },
    }),

    get_plans: tool({
      description:
        "List all workout plans for the user with their names, goals, and active status",
      parameters: jsonSchema({ type: "object", properties: {} }),
      execute: async () => {
        const { data, error } = await supabaseClient
          .from("plans")
          .select(
            "id, name, description, goal, place, frequency, is_active, created_at",
          )
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (error) return { error: "Failed to fetch plans" };
        return data ?? [];
      },
    }),

    search_exercises: tool({
      description:
        "Search for exercises in the exercise library by name or muscle group",
      parameters: z.object({
        query: z
          .string()
          .optional()
          .describe("Part of the exercise name to search for"),
        muscle_group: z
          .string()
          .optional()
          .describe(
            "Filter by muscle group: chest, back, shoulders, biceps, triceps, forearms, abs, obliques, quadriceps, hamstrings, glutes, calves, traps, lats, lower-back, cardio, full-body",
          ),
      }),
      execute: async ({ query, muscle_group }) => {
        let q = supabaseClient
          .from("exercises")
          .select("id, name, muscle_groups, description")
          .limit(15);
        if (query) q = q.ilike("name", `%${query}%`);
        if (muscle_group) q = q.contains("muscle_groups", [muscle_group]);
        const { data, error } = await q;
        if (error) return { error: "Failed to search exercises" };
        return data ?? [];
      },
    }),

    create_plan: tool({
      description:
        "Create and persist a workout plan in the database. The input must include the full nested plan data with workouts, exercises, and sets.",
      parameters: z.object({
        data: PlanInputSchema,
      }),
      execute: async ({ data }) => {
        try {
          const { data: planId, error } = await supabaseService.rpc(
            "create_plan",
            {
              p_plan_data: data,
            },
          );
          if (error) throw error;

          return {
            success: true,
            plan_id: planId,
            plan_name: data.name,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("create_plan tool error:", message);
          return { error: `Failed to create plan: ${message}` };
        }
      },
    }),

    activate_plan: tool({
      description: "Set a specific plan as the user's active plan",
      parameters: z.object({
        plan_id: z.string().describe("The ID of the plan to activate"),
      }),
      execute: async ({ plan_id }) => {
        const { error } = await supabaseService.rpc("activate_plan", {
          plan_id,
        });
        if (error) return { error: "Failed to activate plan" };
        return { success: true, plan_id };
      },
    }),
  };

  // ── Call the AI with the agentic loop ─────────────────────────────────────
  try {
    const model = getModel();

    const { text } = await generateText({
      model,
      system: `You are a personal fitness assistant for the Fitme app. You help users with workout planning, exercise advice, and fitness questions.
You have access to tools to read and manage the user's workout plans.
When creating a plan, always ask the user for their goal, whether they train at a gym or home, days per week, experience level, and preferred workout duration — unless they've already told you.
Use search_exercises to find valid exercise IDs when needed. The create_plan tool only stores the plan data you provide; it does not generate a preview or fill in missing structure for you.
Keep responses concise, friendly, and encouraging. Use markdown sparingly since the app renders plain text.`,
      messages,
      tools,
      maxSteps: 5,
    });

    // ── Save messages to DB ─────────────────────────────────────────────────
    await supabaseService.from("messages").insert([
      {
        conversation_id: conversationId,
        role: "user",
        content: message,
      },
      {
        conversation_id: conversationId,
        role: "assistant",
        content: text,
        metadata: attachmentResult ? { attachment: attachmentResult } : null,
      },
    ]);

    return new Response(
      JSON.stringify({
        message: text,
        conversation_id: conversationId,
        attachment: attachmentResult,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("ai-agent error:", errMessage);
    return new Response(
      JSON.stringify({ error: "Failed to process message" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
