import { supabase } from "@/lib/supabase";
import { Conversation, ConversationWithPreview, Message } from "@/lib/models";
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

export const useConversationsQuery = createQuery<ConversationWithPreview[]>({
  queryKey: ["conversations"],
  fetcher: async (): Promise<ConversationWithPreview[]> => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, user_id, created_at, messages(content, role, created_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((conv) => {
      const firstUserMsg = (
        conv.messages as Array<{
          content: string;
          role: string;
          created_at: string;
        }>
      )
        ?.filter((m) => m.role === "user")
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )[0];
      return {
        id: conv.id,
        user_id: conv.user_id,
        created_at: conv.created_at,
        preview: firstUserMsg?.content ?? null,
      };
    });
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
