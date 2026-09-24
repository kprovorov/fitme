import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { withSupabase } from "npm:@supabase/server";
import { createAgentUIStreamResponse, ToolLoopAgent } from "npm:ai";
import { createActivatePlanTool } from "./tools/activate_plan.ts";
import { createAddExerciseToWorkoutTool } from "./tools/add_exercise_to_workout.ts";
import { createAddSetToExerciseTool } from "./tools/add_set_to_exercise.ts";
import { displayWorkoutPlanTool } from "./tools/display_workout_plan.ts";
import { createGetActivePlanTool } from "./tools/get_active_plan.ts";
import { createGetPlansTool } from "./tools/get_plans.ts";
import { createGetUserProfileTool } from "./tools/get_user_profile.ts";
import { createGetWorkoutsHistoryTool } from "./tools/get_workouts_history.ts";
import { createRemoveExerciseFromWorkoutTool } from "./tools/remove_exercise_from_workout.ts";
import { createRemoveSetFromExerciseTool } from "./tools/remove_set_from_exercise.ts";
import { createReplaceExerciseInWorkoutTool } from "./tools/replace_exercise_in_workout.ts";
import { createSearchExercisesTool } from "./tools/search_exercises.ts";
import { createUpdateSetRecommendationsTool } from "./tools/update_set_recommendations.ts";
import { createUpdateUserProfileTool } from "./tools/update_user_profile.ts";

const openai = createOpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
const anthropic = createAnthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

// Keep in sync with `coachModels` in packages/core/src/models.ts.
const COACH_MODELS = {
  "claude-haiku-4-5-20251001": () => anthropic("claude-haiku-4-5-20251001"),
  "claude-opus-5": () => anthropic("claude-opus-5"),
  "claude-sonnet-5": () => anthropic("claude-sonnet-5"),
  "gpt-5.5": () => openai("gpt-5.5"),
  "gpt-5.6": () => openai("gpt-5.6"),
  "gpt-5.6-luna": () => openai("gpt-5.6-luna"),
  "gpt-5.6-sol": () => openai("gpt-5.6-sol"),
  "gpt-5.6-terra": () => openai("gpt-5.6-terra"),
} as const;
type CoachModelId = keyof typeof COACH_MODELS;
const DEFAULT_COACH_MODEL: CoachModelId = "gpt-5.5";

function isCoachModelId(value: unknown): value is CoachModelId {
  return typeof value === "string" && Object.hasOwn(COACH_MODELS, value);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { messages, model: requestedModel } = await req.json();

    const modelId = requestedModel ?? DEFAULT_COACH_MODEL;
    if (!isCoachModelId(modelId)) {
      return Response.json(
        {
          error: `Unsupported model "${String(modelId)}". Supported: ${Object.keys(COACH_MODELS).join(", ")}.`,
        },
        { status: 400 }
      );
    }

    const tools = {
      activate_plan: createActivatePlanTool(ctx),
      add_exercise_to_workout: createAddExerciseToWorkoutTool(ctx),
      add_set_to_exercise: createAddSetToExerciseTool(ctx),
      display_workout_plan: displayWorkoutPlanTool,
      get_active_plan: createGetActivePlanTool(ctx),
      get_plans: createGetPlansTool(ctx),
      get_user_profile: createGetUserProfileTool(ctx),
      get_workouts_history: createGetWorkoutsHistoryTool(ctx),
      remove_exercise_from_workout: createRemoveExerciseFromWorkoutTool(ctx),
      remove_set_from_exercise: createRemoveSetFromExerciseTool(ctx),
      replace_exercise_in_workout: createReplaceExerciseInWorkoutTool(ctx),
      search_exercises: createSearchExercisesTool(ctx),
      update_set_recommendations: createUpdateSetRecommendationsTool(ctx),
      update_user_profile: createUpdateUserProfileTool(ctx),
    };

    const agent = new ToolLoopAgent({
      instructions: `You are a personal fitness assistant for the Fitme app. You help users with workout planning, exercise advice, and fitness questions.

When creating a plan:
1. Collect from the user: goal, days per week, experience level, preferred workout duration — unless already provided.
2. Call search_exercises for each muscle group needed in the plan. You MUST use the IDs returned — never invent exercise names or IDs.
3. Call display_workout_plan with the full structured plan. Every exercise MUST include the exercise_id field set to the UUID returned by search_exercises. Do not describe the plan in text.

When modifying an existing plan:
1. Always call get_active_plan first to see current workout IDs, workout_exercise IDs, and set IDs.
2. Use workout_exercise IDs (not exercise library IDs) for remove_exercise_from_workout, replace_exercise_in_workout, add_set_to_exercise, update_set_recommendations, and remove_set_from_exercise.
3. Use search_exercises to find valid exercise IDs before calling add_exercise_to_workout or replace_exercise_in_workout.
4. After modifying, confirm the change to the user concisely.
5. Never leave a workout with zero exercises, or an exercise with zero sets.

Available plan modification tools:
- add_exercise_to_workout: add a new exercise with initial sets to a workout day
- remove_exercise_from_workout: remove an exercise and all its sets from a workout day
- replace_exercise_in_workout: swap one exercise for another and replace its sets with new recommendations
- update_set_recommendations: change reps, weight, or rest on a specific set
- add_set_to_exercise: append a new set to an existing exercise
- remove_set_from_exercise: delete a specific set from an exercise

When analyzing workout history or progress:
- Use get_workouts_history to fetch the user's recent completed workouts before making recommendations or analyzing progress.
- Each session includes the workout name, exercises performed, and actual reps/weight completed per set.

For general fitness questions, reply with text only. Never call display_workout_plan unless the user explicitly wants a workout plan generated.

Keep responses concise, friendly, and encouraging.`,
      model: COACH_MODELS[modelId](),
      tools,
    });

    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
    });
  }),
};
