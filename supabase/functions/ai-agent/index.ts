import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateText, tool } from "npm:ai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { z } from "npm:zod";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  gender?: string;
  age?: number;
  height?: number;
  weight?: number;
  measurement_system?: string;
}

interface Exercise {
  id: string;
  name: string;
  thumbnail_url: string;
}

// ─── Plan generation (reused from preview-plan logic) ─────────────────────────

const WORKOUT_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    workouts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          order: { type: "number" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                exercise_id: { type: "string" },
                order: { type: "number" },
                sets: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      order: { type: "number" },
                      weight_recommended: { type: "number" },
                      reps_recommended: { type: "number" },
                      rest_recommended: { type: "number" },
                    },
                    required: [
                      "order",
                      "weight_recommended",
                      "reps_recommended",
                      "rest_recommended",
                    ],
                  },
                },
              },
              required: ["exercise_id", "order", "sets"],
            },
          },
        },
        required: ["name", "description", "order", "exercises"],
      },
    },
  },
  required: ["name", "description", "workouts"],
};

interface GeneratePlanParams {
  goal: string;
  place: string;
  frequency: number;
  experience_level: string;
  workout_duration: number;
  note?: string;
}

function buildPlanPrompts(
  params: GeneratePlanParams,
  exercises: Exercise[],
  profile: Profile | null,
): { systemPrompt: string; userPrompt: string } {
  const exercisesJson = JSON.stringify(exercises);
  const measurementSystem = profile?.measurement_system ?? "metric";
  const weightUnit = measurementSystem === "metric" ? "kg" : "lbs";

  const systemPrompt = [
    "You are a workout assistant. You will be given a user profile and you will need to generate a workout plan.",
    `Here are the exercises you can choose from: ${exercisesJson}. Choose only from the exercises that are in the list.`,
  ].join("\n");

  const userPromptParts = [
    "Create a workout plan using the following user profile and preferences:",
    `Goal: ${params.goal}`,
    `Place: ${params.place}`,
    `Frequency: ${params.frequency} days per week`,
    `Experience level: ${params.experience_level}`,
    `Workout duration: ${params.workout_duration} minutes`,
    `Measurement system: ${measurementSystem} (use ${weightUnit} for weight)`,
  ];

  if (profile?.gender) userPromptParts.push(`Gender: ${profile.gender}`);
  if (profile?.age) userPromptParts.push(`Age: ${profile.age}`);
  if (profile?.weight)
    userPromptParts.push(`Weight: ${profile.weight} ${weightUnit}`);
  if (profile?.height) userPromptParts.push(`Height: ${profile.height}`);
  if (params.note) userPromptParts.push(`Note: ${params.note}`);

  return { systemPrompt, userPrompt: userPromptParts.join("\n") };
}

async function generatePlanStructure(
  params: GeneratePlanParams,
  exercises: Exercise[],
  profile: Profile | null,
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const { systemPrompt, userPrompt } = buildPlanPrompts(
    params,
    exercises,
    profile,
  );

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 10000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [
        {
          name: "generate_workout_plan",
          description: "Generate a structured workout plan",
          input_schema: WORKOUT_PLAN_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "generate_workout_plan" },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Anthropic API error ${response.status}: ${await response.text()}`,
    );
  }

  const data = await response.json();
  const toolUse = data.content?.find(
    (block: { type: string }) => block.type === "tool_use",
  );
  if (!toolUse?.input)
    throw new Error("No structured output returned from plan generation");
  return toolUse.input as Record<string, unknown>;
}

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
  throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
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

  // Track plan actions for the response
  let actionResult: { type: "plan_created" | "plan_activated"; plan_id: string } | undefined;

  // ── Define tools ───────────────────────────────────────────────────────────
  const tools = {
    get_active_plan: tool({
      description:
        "Get the user's currently active workout plan with all workouts and exercises",
      parameters: z.object({}),
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
      parameters: z.object({}),
      execute: async () => {
        const { data, error } = await supabaseClient
          .from("plans")
          .select("id, name, description, goal, place, frequency, is_active, created_at")
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
        if (muscle_group)
          q = q.contains("muscle_groups", [muscle_group]);
        const { data, error } = await q;
        if (error) return { error: "Failed to search exercises" };
        return data ?? [];
      },
    }),

    create_plan: tool({
      description:
        "Generate and immediately save a new workout plan to the database. Always confirm the user's goal, gym/home preference, days per week, experience level, and workout duration before calling this tool.",
      parameters: z.object({
        goal: z.enum([
          "muscle-gain",
          "fat-loss",
          "recomposition",
          "strength-performance",
          "general-health-fitness",
        ]),
        place: z.enum(["gym", "home"]),
        frequency: z.number().min(1).max(7).describe("Days per week"),
        experience_level: z.enum(["beginner", "intermediate", "advanced"]),
        workout_duration: z
          .number()
          .min(30)
          .max(120)
          .describe("Minutes per session"),
        note: z.string().optional().describe("Extra instructions or preferences"),
      }),
      execute: async (params) => {
        try {
          // Fetch exercises and user profile in parallel
          const [exercisesResult, profileResult] = await Promise.all([
            supabaseClient
              .from("exercises")
              .select("id, name, thumbnail_url"),
            supabaseClient
              .from("profiles")
              .select("*")
              .eq("user_id", user.id)
              .single(),
          ]);

          const exercises: Exercise[] = exercisesResult.data ?? [];
          const profile: Profile | null = profileResult.data ?? null;

          // Generate plan structure using Claude structured output
          const aiOutput = await generatePlanStructure(params, exercises, profile);

          // Enrich with exercise objects
          const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
          type RawExercise = { exercise_id: string; [key: string]: unknown };
          type RawWorkout = { exercises: RawExercise[]; [key: string]: unknown };
          const enrichedWorkouts = (aiOutput.workouts as RawWorkout[]).map(
            (workout) => ({
              ...workout,
              exercises: workout.exercises
                .map((ex) => ({
                  ...ex,
                  exercise: exerciseMap.get(ex.exercise_id) ?? null,
                }))
                .filter((ex) => ex.exercise !== null),
            }),
          );

          const planData = {
            ...aiOutput,
            workouts: enrichedWorkouts,
            goal: params.goal,
            place: params.place,
            frequency: params.frequency,
            experience_level: params.experience_level,
            workout_duration: params.workout_duration,
            note: params.note,
          };

          // Strip nested exercise objects for the RPC (same as useStorePlanMutation)
          const payload = {
            ...planData,
            workouts: enrichedWorkouts.map((w) => ({
              ...w,
              exercises: w.exercises.map(
                ({ exercise: _exercise, ...ex }: { exercise: unknown; [key: string]: unknown }) => ex,
              ),
            })),
          };

          const { data: planId, error: rpcError } = await supabaseService.rpc(
            "create_plan",
            { p_plan_data: payload },
          );
          if (rpcError) throw rpcError;

          actionResult = { type: "plan_created", plan_id: planId as string };
          return {
            success: true,
            plan_id: planId,
            plan_name: aiOutput.name,
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
        actionResult = { type: "plan_activated", plan_id };
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
      },
    ]);

    return new Response(
      JSON.stringify({
        message: text,
        conversation_id: conversationId,
        action: actionResult,
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
