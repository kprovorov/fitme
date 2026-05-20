import { createOpenAI } from "npm:@ai-sdk/openai";
import { withSupabase } from "npm:@supabase/server";
import { createAgentUIStreamResponse, ToolLoopAgent } from "npm:ai";
import { createActivatePlanTool } from "./tools/activate_plan.ts";
import { displayWorkoutPlanTool } from "./tools/display_workout_plan.ts";
import { createGetActivePlanTool } from "./tools/get_active_plan.ts";
import { createGetPlansTool } from "./tools/get_plans.ts";
import { createGetUserProfileTool } from "./tools/get_user_profile.ts";
import { createSearchExercisesTool } from "./tools/search_exercises.ts";
import { createUpdateUserProfileTool } from "./tools/update_user_profile.ts";
import { createAddExerciseToWorkoutTool } from "./tools/add_exercise_to_workout.ts";
import { createRemoveExerciseFromWorkoutTool } from "./tools/remove_exercise_from_workout.ts";
import { createReplaceExerciseInWorkoutTool } from "./tools/replace_exercise_in_workout.ts";
import { createUpdateSetRecommendationsTool } from "./tools/update_set_recommendations.ts";
import { createAddSetToExerciseTool } from "./tools/add_set_to_exercise.ts";
import { createRemoveSetFromExerciseTool } from "./tools/remove_set_from_exercise.ts";

const openai = createOpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { messages } = await req.json();

    const tools = {
      get_active_plan: createGetActivePlanTool(ctx),
      get_plans: createGetPlansTool(ctx),
      get_user_profile: createGetUserProfileTool(ctx),
      update_user_profile: createUpdateUserProfileTool(ctx),
      search_exercises: createSearchExercisesTool(ctx),
      activate_plan: createActivatePlanTool(ctx),
      display_workout_plan: displayWorkoutPlanTool,
      add_exercise_to_workout: createAddExerciseToWorkoutTool(ctx),
      remove_exercise_from_workout: createRemoveExerciseFromWorkoutTool(ctx),
      replace_exercise_in_workout: createReplaceExerciseInWorkoutTool(ctx),
      update_set_recommendations: createUpdateSetRecommendationsTool(ctx),
      add_set_to_exercise: createAddSetToExerciseTool(ctx),
      remove_set_from_exercise: createRemoveSetFromExerciseTool(ctx),
    };

    const agent = new ToolLoopAgent({
      model: openai("gpt-5.4-mini"),
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

For general fitness questions, reply with text only. Never call display_workout_plan unless the user explicitly wants a workout plan generated.

Keep responses concise, friendly, and encouraging.`,
      tools,
    });

    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
    });
  }),
};
