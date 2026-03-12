import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_ATTEMPTS = 3;

async function checkRevenueCatEntitlement(rcUserId: string): Promise<boolean> {
  const apiKey = Deno.env.get("REVENUECAT_API_KEY");
  if (!apiKey) {
    console.warn("REVENUECAT_API_KEY not set, skipping subscription check");
    return true;
  }

  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    console.error(`RevenueCat API error: ${response.status}`);
    return false;
  }

  const data = await response.json();
  const entitlement = data?.subscriber?.entitlements?.["Fitme Pro"];
  if (!entitlement) return false;

  // null expires_date means lifetime purchase
  if (entitlement.expires_date === null) return true;

  return new Date(entitlement.expires_date) > new Date();
}

// Shared JSON Schema for the workout plan structured output.
// `additionalProperties: false` is required at every object level for OpenAI strict mode.
const WORKOUT_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "The name of the workout plan." },
    description: {
      type: "string",
      description:
        "A brief description of the workout plan. Max 255 characters.",
    },
    workouts: {
      type: "array",
      description: "A list of workouts in the workout plan.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            description:
              "The name of the workout. Do not use any numeration here (e.g. 'Workout X', 'Day X', etc.).",
          },
          description: {
            type: "string",
            description:
              "A description of what the workout includes. Max 255 characters.",
          },
          order: {
            type: "number",
            description: "The position of this workout in the list.",
          },
          exercises: {
            type: "array",
            description: "A list of exercises included in the workout.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                exercise_id: {
                  type: "string",
                  description:
                    "The id of the exercise. Use the id from the list of exercises provided.",
                },
                order: {
                  type: "number",
                  description: "The position of this exercise in the workout.",
                },
                sets: {
                  type: "array",
                  description: "A list of sets for this exercise.",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      order: {
                        type: "number",
                        description: "The position of this set.",
                      },
                      weight_recommended: {
                        type: "number",
                        description:
                          "The weight to be used for the set. Use same unit as the user's measurement system.",
                      },
                      reps_recommended: {
                        type: "number",
                        description: "The number of repetitions for the set.",
                      },
                      rest_recommended: {
                        type: "number",
                        description:
                          "The time to rest after the set (in seconds).",
                      },
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

type Provider = "anthropic" | "openai";

interface ProviderConfig {
  provider: Provider;
  model: string;
}

function getAvailableProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];
  if (Deno.env.get("ANTHROPIC_API_KEY")) {
    providers.push({ provider: "anthropic", model: "claude-sonnet-4-6" });
  }
  if (Deno.env.get("OPENAI_API_KEY")) {
    providers.push({ provider: "openai", model: "gpt-4o" });
  }
  return providers;
}

function pickRandomProvider(providers: ProviderConfig[]): ProviderConfig {
  return providers[Math.floor(Math.random() * providers.length)];
}

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
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
    throw new Error("No structured output returned from Anthropic");
  return toolUse.input as Record<string, unknown>;
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("OPENAI_API_KEY")!;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 10000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "generate_workout_plan",
            description: "Generate a structured workout plan",
            strict: true,
            parameters: WORKOUT_PLAN_SCHEMA,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "generate_workout_plan" },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI API error ${response.status}: ${await response.text()}`,
    );
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("No structured output returned from OpenAI");
  }
  return JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
}

interface GeneratePlanParams {
  goal: string;
  place: string;
  frequency: number;
  experience_level: string;
  workout_duration: number;
  note?: string;
}

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

function buildPrompts(
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

async function callAIWithRetry(
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  const providers = getAvailableProviders();
  if (providers.length === 0) {
    throw new Error(
      "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { provider, model } = pickRandomProvider(providers);
    try {
      console.log(
        `Attempt ${attempt}: using provider=${provider} model=${model}`,
      );
      if (provider === "anthropic") {
        return await callAnthropic(systemPrompt, userPrompt, model);
      } else {
        return await callOpenAI(systemPrompt, userPrompt, model);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `Attempt ${attempt} failed (${provider}/${model}):`,
        lastError.message,
      );
    }
  }

  throw lastError ?? new Error("All attempts to generate workout plan failed");
}

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

  // Early return for E2E tests: skips AI call, returns a fixture plan
  if (req.headers.get("x-e2e") === "true") {
    const { data: exercises } = await supabaseClient
      .from("exercises")
      .select("id, name, thumbnail_url")
      .limit(6);
    const fixtureExercises = exercises ?? [];

    function buildE2EFixturePlan(exs: Exercise[]) {
      const workout1Exercises = exs.slice(0, 3);
      const workout2Exercises = exs.slice(3, 6);

      const makeWorkout = (
        name: string,
        desc: string,
        order: number,
        wExercises: Exercise[],
      ) => ({
        name,
        description: desc,
        order,
        exercises: wExercises.map((ex, i) => ({
          exercise_id: ex.id,
          exercise: ex,
          order: i + 1,
          sets: [
            {
              order: 1,
              weight_recommended: 0,
              reps_recommended: 10,
              rest_recommended: 60,
            },
            {
              order: 2,
              weight_recommended: 0,
              reps_recommended: 10,
              rest_recommended: 60,
            },
            {
              order: 3,
              weight_recommended: 0,
              reps_recommended: 10,
              rest_recommended: 60,
            },
          ],
        })),
      });

      return {
        name: "E2E Test Plan",
        description: "Auto-generated fixture plan for E2E tests.",
        goal: "general_fitness",
        place: "gym",
        frequency: 2,
        experience_level: "beginner",
        workout_duration: 45,
        workouts: [
          makeWorkout(
            "E2E Workout A",
            "First workout of the fixture plan.",
            1,
            workout1Exercises,
          ),
          makeWorkout(
            "E2E Workout B",
            "Second workout of the fixture plan.",
            2,
            workout2Exercises,
          ),
        ],
      };
    }

    const fixturePlan = buildE2EFixturePlan(fixtureExercises);
    return new Response(JSON.stringify(fixturePlan), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body: GeneratePlanParams = await req.json();

  const [exercisesResult, profileResult, plansCountResult] = await Promise.all([
    supabaseClient.from("exercises").select("id, name, thumbnail_url"),
    supabaseClient.from("profiles").select("*").eq("user_id", user.id).single(),
    supabaseClient
      .from("plans")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);

  if (exercisesResult.error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch exercises" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Subscription gate: first plan is free; subsequent plans require PRO
  const planCount = plansCountResult.count ?? 0;
  if (planCount > 0) {
    const rcUserId = profileResult.data?.rc_user_id as string | null;
    if (!rcUserId) {
      return new Response(JSON.stringify({ error: "Subscription required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const isPro = await checkRevenueCatEntitlement(rcUserId);
    if (!isPro) {
      return new Response(JSON.stringify({ error: "Subscription required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const exercises: Exercise[] = exercisesResult.data ?? [];
  const profile: Profile | null = profileResult.data ?? null;

  const { systemPrompt, userPrompt } = buildPrompts(body, exercises, profile);

  try {
    const aiOutput = await callAIWithRetry(systemPrompt, userPrompt);

    const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

    // Enrich AI output: replace exercise_id with a nested exercise object,
    // matching what WorkoutExerciseData expects on the client.
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
      goal: body.goal,
      place: body.place,
      frequency: body.frequency,
      experience_level: body.experience_level,
      workout_duration: body.workout_duration,
      note: body.note,
    };

    return new Response(JSON.stringify(planData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to generate workout plan:", message);
    return new Response(
      JSON.stringify({ error: "Failed to generate workout plan" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
