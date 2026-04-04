import { supabase } from "@/lib/supabase";
import { Conversation, Message } from "@/lib/models";
import { createQuery } from "react-query-kit";

export const useConversationQuery = createQuery<Conversation | null>({
  queryKey: ["conversation"],
  fetcher: async (): Promise<Conversation | null> => {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    return (data as Conversation) ?? null;
  },
});

export type MessagesQueryVariables = {
  conversationId: string;
};

export const useMessagesQuery = createQuery<Message[], MessagesQueryVariables>({
  queryKey: ["messages"],
  fetcher: async ({ conversationId }): Promise<Message[]> => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as Message[]) ?? [];
  },
});
