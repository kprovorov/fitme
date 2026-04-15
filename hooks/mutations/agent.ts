import { fetch as expoFetch } from "expo/fetch";
import { createMutation } from "react-query-kit";
import type { AgentResponse } from "@/lib/models";
import { supabase, supabaseAnonKey, supabaseUrl } from "@/lib/supabase";

export interface SendMessageData {
  conversationId?: string;
  message: string;
  onChunk?: (chunk: string, conversationId: string) => void;
}

export const useSendMessageMutation = createMutation<
  AgentResponse,
  SendMessageData
>({
  mutationFn: async ({
    message,
    conversationId,
    onChunk,
  }: SendMessageData): Promise<AgentResponse> => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session?.access_token) {
      throw new Error("Unauthorized");
    }

    const response = await expoFetch(`${supabaseUrl}/functions/v1/ai-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
      }),
    });

    if (!response.ok) {
      let errorMessage = "Failed to process message";

      try {
        const errorBody = (await response.json()) as { error?: string };
        if (errorBody.error) {
          errorMessage = errorBody.error;
        }
      } catch {
        // Ignore JSON parse errors and keep the default message.
      }

      throw new Error(errorMessage);
    }

    const resolvedConversationId =
      response.headers.get("x-conversation-id") ?? conversationId;

    if (!resolvedConversationId) {
      throw new Error("Missing conversation id");
    }

    const reader = response.body?.getReader();

    if (!reader) {
      const messageText = await response.text();
      return {
        message: messageText,
        conversation_id: resolvedConversationId,
      };
    }

    const decoder = new TextDecoder();
    let fullMessage = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });

      if (!chunk) {
        continue;
      }

      fullMessage += chunk;
      onChunk?.(chunk, resolvedConversationId);
    }

    fullMessage += decoder.decode();

    return {
      message: fullMessage,
      conversation_id: resolvedConversationId,
    };
  },
});
