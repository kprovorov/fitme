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
    };

    const agent = new ToolLoopAgent({
      model: openai("gpt-5.4-mini"),
      instructions: `You are a personal fitness assistant for the Fitme app. You help users with workout planning, exercise advice, and fitness questions.

When creating a plan:
1. Collect from the user: goal, days per week, experience level, preferred workout duration — unless already provided.
2. Call search_exercises for each muscle group needed in the plan. You MUST use the IDs returned — never invent exercise names or IDs.
3. Call display_workout_plan with the full structured plan. Every exercise MUST include the exercise_id field set to the UUID returned by search_exercises. Do not describe the plan in text.

For general fitness questions, reply with text only. Never call display_workout_plan unless the user explicitly wants a workout plan generated.

Keep responses concise, friendly, and encouraging`,
      tools,
    });

    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
    });
  }),
};
