import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "~/components/ui/text";
import { Input } from "~/components/ui/input";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import AgentMessageView from "~/components/views/agent-message-view";
import { useConversationQuery, useMessagesQuery } from "~/hooks/queries/agent";
import { useSendMessageMutation } from "~/hooks/mutations/agent";
import { MessageAttachment, Message } from "~/lib/models";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { Sparkles } from "~/lib/icons/Sparkles";

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: { attachment?: MessageAttachment };
};

export default function AgentScreen() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const flatListRef = useRef<FlatList>(null);

  const { data: conversation } = useConversationQuery();
  const { data: serverMessages } = useMessagesQuery({
    variables: { conversationId: conversationId! },
    enabled: !!conversationId,
  });
  const { mutate: sendMessage, isPending } = useSendMessageMutation();

  // Sync conversation from server on mount
  useEffect(() => {
    if (conversation?.id && !conversationId) {
      setConversationId(conversation.id);
    }
  }, [conversation, conversationId]);

  // Sync messages from server into local state
  useEffect(() => {
    if (serverMessages && serverMessages.length > 0) {
      const mapped: LocalMessage[] = serverMessages.map((m: Message) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        metadata: m.metadata,
      }));
      setLocalMessages(mapped);
    }
  }, [serverMessages]);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isPending) return;

    setInput("");

    // Optimistically append user message
    const userMsg: LocalMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setTimeout(scrollToBottom, 50);

    sendMessage(
      { message: text, conversationId },
      {
        onSuccess: (response) => {
          if (!conversationId && response.conversation_id) {
            setConversationId(response.conversation_id);
          }

          const assistantMsg: LocalMessage = {
            id: `local-assistant-${Date.now()}`,
            role: "assistant",
            content: response.message,
            created_at: new Date().toISOString(),
            metadata: response.attachment
              ? { attachment: response.attachment }
              : undefined,
          };
          setLocalMessages((prev) => [...prev, assistantMsg]);
          setTimeout(scrollToBottom, 50);

          // Invalidate messages so the server state syncs
          if (response.conversation_id) {
            queryClient.invalidateQueries({
              queryKey: [
                "messages",
                { conversationId: response.conversation_id },
              ],
            });
          }
        },
        onError: () => {
          const errorMsg: LocalMessage = {
            id: `local-error-${Date.now()}`,
            role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
            created_at: new Date().toISOString(),
          };
          setLocalMessages((prev) => [...prev, errorMsg]);
          setTimeout(scrollToBottom, 50);
        },
      },
    );
  }, [
    input,
    isPending,
    conversationId,
    sendMessage,
    scrollToBottom,
    queryClient,
  ]);

  const renderMessage = useCallback(
    ({ item }: { item: LocalMessage }) => (
      <AgentMessageView
        message={{
          id: item.id,
          conversation_id: conversationId ?? "",
          role: item.role,
          content: item.content,
          created_at: item.created_at,
          metadata: item.metadata,
        }}
      />
    ),
    [conversationId],
  );

  const keyExtractor = useCallback((item: LocalMessage) => item.id, []);

  return (
    <SafeAreaView edges={["top"]} className="flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Header */}
        <View className="px-6 pt-2 pb-4 border-b border-white/10">
          <H3>AI Agent</H3>
        </View>

        {/* Message list */}
        {localMessages.length === 0 ? (
          <VStack className="flex-1 items-center justify-center px-8 gap-4">
            <Sparkles className="w-12 h-12 text-primary" />
            <Text className="text-center text-muted-foreground">
              Ask me anything about fitness, or let me create a workout plan for
              you.
            </Text>
          </VStack>
        ) : (
          <FlatList
            ref={flatListRef}
            data={localMessages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
          />
        )}

        {/* Typing indicator */}
        {isPending && (
          <View className="px-4 pb-2">
            <View className="self-start bg-card border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
              <Text className="text-muted-foreground text-sm">Thinking...</Text>
            </View>
          </View>
        )}

        {/* Input row */}
        <View
          className="flex-row items-center gap-3 px-4 py-3 border-t border-white/10"
          style={{ paddingBottom: 80 }}
        >
          <Input
            className="flex-1 bg-card"
            placeholder="Message..."
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!isPending}
            multiline={false}
          />
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || isPending}
            className={`w-10 h-10 rounded-full items-center justify-center ${
              input.trim() && !isPending ? "bg-primary" : "bg-muted"
            }`}
          >
            <ArrowRight
              className={`w-5 h-5 ${
                input.trim() && !isPending
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
