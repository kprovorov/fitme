import { supabase } from "@/lib/supabase";
import { AgentResponse } from "@/lib/models";
import { createMutation } from "react-query-kit";

export type SendMessageData = {
  message: string;
  conversationId?: string;
};

export const useSendMessageMutation = createMutation<
  AgentResponse,
  SendMessageData
>({
  mutationFn: async ({
    message,
    conversationId,
  }: SendMessageData): Promise<AgentResponse> => {
    const { data, error } = await supabase.functions.invoke("ai-agent", {
      body: {
        message,
        conversation_id: conversationId,
      },
    });
    if (error) throw error;
    return data as AgentResponse;
  },
});
