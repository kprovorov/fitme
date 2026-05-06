import { createClient } from "jsr:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { convertToModelMessages, streamText } from "npm:ai";

const openai = createOpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages } = await req.json();

  console.log(messages);

  const convertedMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system:
      "You are a personal fitness coach assistant. Help the user with their workouts, nutrition, and fitness goals.",
    messages: convertedMessages,
  });

  return result.toUIMessageStreamResponse();
});
