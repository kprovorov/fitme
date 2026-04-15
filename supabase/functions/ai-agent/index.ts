import { createClient } from "jsr:@supabase/supabase-js@2";
import { ToolLoopAgent, stepCountIs } from "npm:ai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";

import { createGetActivePlanTool } from "./tools/get_active_plan.ts";
import { createGetPlansTool } from "./tools/get_plans.ts";
import { createGetUserProfileTool } from "./tools/get_user_profile.ts";
import { createUpdateUserProfileTool } from "./tools/update_user_profile.ts";
import { createGetUserWorkoutHistoryTool } from "./tools/get_user_workout_history.ts";
import { createSearchExercisesTool } from "./tools/search_exercises.ts";
import { createCreatePlanTool } from "./tools/create_plan.ts";
import { createActivatePlanTool } from "./tools/activate_plan.ts";
import { createUpdatePlanTool } from "./tools/update_plan.ts";

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (event: string, data?: Record<string, unknown>) =>
    console.log(JSON.stringify({ requestId, event, ...data }));

  log("request_received", { method: req.method });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    log("auth_missing");
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
    log("auth_failed", { error: userError?.message });
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  log("auth_ok", { userId: user.id });

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
    log("conversation_created", { conversationId });
  } else {
    log("conversation_resumed", { conversationId });
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
  log("history_loaded", { messageCount: historyMessages.length });

  // ── Build full messages array ───────────────────────────────────────────────
  const messages = [
    ...historyMessages,
    { role: "user" as const, content: message },
  ];

  // ── Build tools ────────────────────────────────────────────────────────────
  let affectedPlanId: string | undefined;
  const ctx = {
    supabaseClient,
    supabaseService,
    log,
    onPlanCreated: (planId: string) => {
      affectedPlanId = planId;
    },
    onPlanUpdated: (planId: string) => {
      affectedPlanId = planId;
    },
  };
  const tools = {
    get_active_plan: createGetActivePlanTool(ctx),
    get_plans: createGetPlansTool(ctx),
    get_user_profile: createGetUserProfileTool(ctx),
    update_user_profile: createUpdateUserProfileTool(ctx),
    get_user_workout_history: createGetUserWorkoutHistoryTool(ctx),
    search_exercises: createSearchExercisesTool(ctx),
    create_plan: createCreatePlanTool(ctx),
    update_plan: createUpdatePlanTool(ctx),
    activate_plan: createActivatePlanTool(ctx),
  };

  // ── Call the AI with the agentic loop ─────────────────────────────────────
  try {
    const anthropic = createAnthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
    });
    log("ai_request_start", { messageCount: messages.length });

    const agent = new ToolLoopAgent({
      model: anthropic("claude-sonnet-4-6"),
      instructions: `You are a personal fitness assistant for the Fitme app. You help users with workout planning, exercise advice, and fitness questions.
You have access to tools to read and manage the user's workout plans.

When creating a plan:
1. Collect from the user: goal, gym or home, days per week, experience level, preferred workout duration — unless already provided.
2. Use search_exercises to find valid exercise IDs for all needed muscle groups.
3. Once you have the exercise IDs, immediately call create_plan without asking for confirmation. Do not stop to summarize or ask "shall I proceed?" — just create the plan.
4. After the plan is created, respond with a short confirmation only (e.g. "Your plan is ready! 💪"). Do NOT list or describe the workouts, exercises, or sets in your text — the plan is displayed as an interactive card below your message.

When updating an existing plan:
1. Use get_plans or get_active_plan to identify the target plan if needed.
2. Build the full revised nested plan data, not a partial patch.
3. Once you have the final revised plan data, immediately call update_plan without asking for confirmation.
4. After updating, respond with a short confirmation only. Do NOT describe the updated plan content in your text — it is shown as an interactive card.

Keep responses concise, friendly, and encouraging. Use markdown sparingly since the app renders plain text.`,
      tools,
      stopWhen: stepCountIs(20),
      onStepFinish: async ({ stepNumber, finishReason, toolCalls }) => {
        log("step_finish", {
          stepNumber,
          finishReason,
          toolsUsed: toolCalls?.map((tc) => tc.toolName),
        });
      },
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          let fullText = "";

          try {
            const result = await agent.stream({
              messages,
              abortSignal: req.signal,
            });

            for await (const chunk of result.textStream) {
              if (!chunk) {
                continue;
              }

              fullText += chunk;
              controller.enqueue(encoder.encode(chunk));
            }

            log("ai_request_done", {
              responseLength: fullText.length,
              response: fullText,
            });

            // ── Fetch created plan as attachment (if any) ──────────────────
            let attachment: {
              type: "plan_preview";
              planId: string;
              data: unknown;
            } | null = null;
            if (affectedPlanId) {
              const { data: plan } = await supabaseClient
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
                .eq("id", affectedPlanId)
                .single();
              if (plan) {
                attachment = {
                  type: "plan_preview",
                  planId: affectedPlanId,
                  data: plan,
                };
                log("plan_attachment_ready", { planId: affectedPlanId });
              }
            }

            // ── Save messages to DB ───────────────────────────────────────
            await supabaseService.from("messages").insert([
              {
                conversation_id: conversationId,
                role: "user",
                content: message,
              },
              {
                conversation_id: conversationId,
                role: "assistant",
                content: fullText,
                metadata: attachment ? { attachment } : null,
              },
            ]);

            controller.close();
          } catch (err) {
            const errMessage =
              err instanceof Error ? err.message : "Unknown error";
            log("ai_request_error", { error: errMessage });
            controller.error(err);
          }
        })();
      },
      cancel(reason) {
        log("stream_cancelled", {
          reason: reason instanceof Error ? reason.message : String(reason),
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Content-Encoding": "none",
        "x-conversation-id": conversationId ?? "",
      },
    });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : "Unknown error";
    log("ai_request_error", { error: errMessage });
    return new Response(
      JSON.stringify({ error: "Failed to process message" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
