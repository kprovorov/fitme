import { createOpenAI } from "npm:@ai-sdk/openai";
import { withSupabase } from "npm:@supabase/server";
import { convertToModelMessages, streamText } from "npm:ai";
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

    const result = streamText({
      model: openai("gpt-5.4-mini"),
      tools,
      system:
        "You are a personal fitness coach assistant. Help the user with their workouts, nutrition, and fitness goals.",
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "none",
      },
    });
  }),
};
