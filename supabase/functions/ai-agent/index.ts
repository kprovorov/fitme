import { createOpenAI } from "npm:@ai-sdk/openai";
import { withSupabase } from "npm:@supabase/server";
import { convertToModelMessages, streamText } from "npm:ai";

const openai = createOpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

export default {
  fetch: withSupabase({ auth: "user" }, async (req, _ctx) => {
    const { messages } = await req.json();

    const result = streamText({
      model: openai("gpt-5.4-mini"),
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
