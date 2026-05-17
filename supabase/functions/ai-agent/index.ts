import { createOpenAI } from "npm:@ai-sdk/openai";
import { withSupabase } from "npm:@supabase/server";
import { createAgentUIStreamResponse, ToolLoopAgent } from "npm:ai";
import { createActivatePlanTool } from "./tools/activate_plan.ts";
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
    };

    const agent = new ToolLoopAgent({
      model: openai("gpt-5.4-mini"),
      instructions: `You are a personal fitness assistant for the Fitme app. You help users with workout planning, exercise advice, and fitness questions.
You have access to tools to read and manage the user's workout plans.

When creating a plan:
1. Collect from the user: goal, gym or home, days per week, experience level, preferred workout duration — unless already provided.
2. Use search_exercises to find valid exercise IDs for all needed muscle groups.
3. Once you have the exercise IDs, immediately call create_plan without asking for confirmation. Do not stop to summarize or ask "shall I proceed?" — just create the plan.
4. After the plan is created, respond with a short confirmation only (e.g. "Your plan is ready! 💪"). Do NOT list or describe the workouts, exercises, or sets in your text — the plan is displayed as an interactive card below your message.

Keep responses concise, friendly, and encouraging`,
      tools,
    });

    // const result = streamText({
    //   model: openai("gpt-5.4-mini"),
    //   tools,
    //   system:
    //     "You are a personal fitness coach assistant. Help the user with their workouts, nutrition, and fitness goals.",
    //   messages: await convertToModelMessages(messages),
    // });
    //
    //
    //

    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
    });
  }),
};
