import { withSupabase } from "npm:@supabase/server";

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
    }
  );

  if (!response.ok) {
    console.error(`RevenueCat API error: ${response.status}`);
    return false;
  }

  const data = await response.json();
  const entitlement = data?.subscriber?.entitlements?.["Fitme Pro"];
  if (!entitlement) {
    return false;
  }

  // null expires_date means lifetime purchase
  if (entitlement.expires_date === null) {
    return true;
  }

  return new Date(entitlement.expires_date) > new Date();
}

// Shared JSON Schema for the workout plan structured output.
// `additionalProperties: false` is required at every object level for OpenAI strict mode.
const WORKOUT_PLAN_SCHEMA = {
  additionalProperties: false,
  properties: {
    description: {
      description:
        "A brief description of the workout plan. Max 255 characters.",
      type: "string",
    },
    name: { description: "The name of the workout plan.", type: "string" },
    workouts: {
      description: "A list of workouts in the workout plan.",
      items: {
        additionalProperties: false,
        properties: {
          description: {
            description:
              "A description of what the workout includes. Max 255 characters.",
            type: "string",
          },
          exercises: {
            description: "A list of exercises included in the workout.",
            items: {
              additionalProperties: false,
              properties: {
                exercise_id: {
                  description:
                    "The id of the exercise. Use the id from the list of exercises provided.",
                  type: "string",
                },
                order: {
                  description: "The position of this exercise in the workout.",
                  type: "number",
                },
                sets: {
                  description: "A list of sets for this exercise.",
                  items: {
                    additionalProperties: false,
                    properties: {
                      order: {
                        description: "The position of this set.",
                        type: "number",
                      },
                      reps_recommended: {
                        description: "The number of repetitions for the set.",
                        type: "number",
                      },
                      rest_recommended: {
                        description:
                          "The time to rest after the set (in seconds).",
                        type: "number",
                      },
                      weight_recommended: {
                        description:
                          "The weight to be used for the set. Use same unit as the user's measurement system.",
                        type: "number",
                      },
                    },
                    required: [
                      "order",
                      "weight_recommended",
                      "reps_recommended",
                      "rest_recommended",
                    ],
                    type: "object",
                  },
                  type: "array",
                },
              },
              required: ["exercise_id", "order", "sets"],
              type: "object",
            },
            type: "array",
          },
          name: {
            description:
              "The name of the workout. Do not use any numeration here (e.g. 'Workout X', 'Day X', etc.).",
            type: "string",
          },
          order: {
            description: "The position of this workout in the list.",
            type: "number",
          },
        },
        required: ["name", "description", "order", "exercises"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["name", "description", "workouts"],
  type: "object",
};

type Provider = "anthropic" | "openai";

interface ProviderConfig {
  model: string;
  provider: Provider;
}

function getAvailableProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];
  if (Deno.env.get("ANTHROPIC_API_KEY")) {
    providers.push({ model: "claude-sonnet-4-6", provider: "anthropic" });
  }
  if (Deno.env.get("OPENAI_API_KEY")) {
    providers.push({ model: "gpt-4o", provider: "openai" });
  }
  return providers;
}

function pickRandomProvider(providers: ProviderConfig[]): ProviderConfig {
  return providers[Math.floor(Math.random() * providers.length)];
}

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    body: JSON.stringify({
      max_tokens: 10_000,
      messages: [{ content: userPrompt, role: "user" }],
      model,
      system: systemPrompt,
      tool_choice: { name: "generate_workout_plan", type: "tool" },
      tools: [
        {
          description: "Generate a structured workout plan",
          input_schema: WORKOUT_PLAN_SCHEMA,
          name: "generate_workout_plan",
        },
      ],
    }),
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Anthropic API error ${response.status}: ${await response.text()}`
    );
  }

  const data = await response.json();
  const toolUse = data.content?.find(
    (block: { type: string }) => block.type === "tool_use"
  );
  if (!toolUse?.input) {
    throw new Error("No structured output returned from Anthropic");
  }
  return toolUse.input as Record<string, unknown>;
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    body: JSON.stringify({
      max_tokens: 10_000,
      messages: [
        { content: systemPrompt, role: "system" },
        { content: userPrompt, role: "user" },
      ],
      model,
      tool_choice: {
        function: { name: "generate_workout_plan" },
        type: "function",
      },
      tools: [
        {
          function: {
            description: "Generate a structured workout plan",
            name: "generate_workout_plan",
            parameters: WORKOUT_PLAN_SCHEMA,
            strict: true,
          },
          type: "function",
        },
      ],
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI API error ${response.status}: ${await response.text()}`
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
  experience_level: string;
  frequency: number;
  goal: string;
  note?: string;
  place: string;
  workout_duration: number;
}

interface Profile {
  age?: number;
  gender?: string;
  height?: number;
  measurement_system?: string;
  weight?: number;
}

interface Exercise {
  id: string;
  name: string;
  thumbnail_url: string;
}

function buildPrompts(
  params: GeneratePlanParams,
  exercises: Exercise[],
  profile: Profile | null
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

  if (profile?.gender) {
    userPromptParts.push(`Gender: ${profile.gender}`);
  }
  if (profile?.age) {
    userPromptParts.push(`Age: ${profile.age}`);
  }
  if (profile?.weight) {
    userPromptParts.push(`Weight: ${profile.weight} ${weightUnit}`);
  }
  if (profile?.height) {
    userPromptParts.push(`Height: ${profile.height}`);
  }
  if (params.note) {
    userPromptParts.push(`Note: ${params.note}`);
  }

  return { systemPrompt, userPrompt: userPromptParts.join("\n") };
}

async function callAIWithRetry(
  systemPrompt: string,
  userPrompt: string
): Promise<Record<string, unknown>> {
  const providers = getAvailableProviders();
  if (providers.length === 0) {
    throw new Error(
      "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY."
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { provider, model } = pickRandomProvider(providers);
    try {
      console.log(
        `Attempt ${attempt}: using provider=${provider} model=${model}`
      );
      if (provider === "anthropic") {
        return await callAnthropic(systemPrompt, userPrompt, model);
      }
      return await callOpenAI(systemPrompt, userPrompt, model);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `Attempt ${attempt} failed (${provider}/${model}):`,
        lastError.message
      );
    }
  }

  throw lastError ?? new Error("All attempts to generate workout plan failed");
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Early return for E2E tests: skips AI call, returns a fixture plan
    if (req.headers.get("x-e2e") === "true") {
      const { data: exercises } = await ctx.supabase
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
          wExercises: Exercise[]
        ) => ({
          description: desc,
          exercises: wExercises.map((ex, i) => ({
            exercise: ex,
            exercise_id: ex.id,
            order: i + 1,
            sets: [
              {
                order: 1,
                reps_recommended: 10,
                rest_recommended: 60,
                weight_recommended: 0,
              },
              {
                order: 2,
                reps_recommended: 10,
                rest_recommended: 60,
                weight_recommended: 0,
              },
              {
                order: 3,
                reps_recommended: 10,
                rest_recommended: 60,
                weight_recommended: 0,
              },
            ],
          })),
          name,
          order,
        });

        return {
          description: "Auto-generated fixture plan for E2E tests.",
          experience_level: "beginner",
          frequency: 2,
          goal: "general_fitness",
          name: "E2E Test Plan",
          place: "gym",
          workout_duration: 45,
          workouts: [
            makeWorkout(
              "E2E Workout A",
              "First workout of the fixture plan.",
              1,
              workout1Exercises
            ),
            makeWorkout(
              "E2E Workout B",
              "Second workout of the fixture plan.",
              2,
              workout2Exercises
            ),
          ],
        };
      }

      const fixturePlan = buildE2EFixturePlan(fixtureExercises);
      return Response.json(fixturePlan);
    }

    const body: GeneratePlanParams = await req.json();

    const [exercisesResult, profileResult, plansCountResult] =
      await Promise.all([
        ctx.supabase.from("exercises").select("id, name, thumbnail_url"),
        ctx.supabase
          .from("profiles")
          .select("*")
          .eq("user_id", userId)
          .single(),
        ctx.supabase
          .from("plans")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
      ]);

    if (exercisesResult.error) {
      return Response.json(
        { error: "Failed to fetch exercises" },
        { status: 500 }
      );
    }

    // Subscription gate: first plan is free; subsequent plans require PRO
    const planCount = plansCountResult.count ?? 0;
    if (planCount > 0) {
      const isPro = await checkRevenueCatEntitlement(userId);
      if (!isPro) {
        return Response.json(
          { error: "Subscription required" },
          { status: 403 }
        );
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
      interface RawExercise {
        exercise_id: string;
        [key: string]: unknown;
      }
      interface RawWorkout {
        exercises: RawExercise[];
        [key: string]: unknown;
      }
      const enrichedWorkouts = (aiOutput.workouts as RawWorkout[]).map(
        (workout) => ({
          ...workout,
          exercises: workout.exercises
            .map((ex) => ({
              ...ex,
              exercise: exerciseMap.get(ex.exercise_id) ?? null,
            }))
            .filter((ex) => ex.exercise !== null),
        })
      );

      const planData = {
        ...aiOutput,
        experience_level: body.experience_level,
        frequency: body.frequency,
        goal: body.goal,
        note: body.note,
        place: body.place,
        workout_duration: body.workout_duration,
        workouts: enrichedWorkouts,
      };

      return Response.json(planData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to generate workout plan:", message);
      return Response.json(
        { error: "Failed to generate workout plan" },
        { status: 500 }
      );
    }
  }),
};
