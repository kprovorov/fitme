import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGradualAnimation } from "@/lib/utils";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import AgentMessageView from "~/components/views/agent-message-view";
import { useSendMessageMutation } from "~/hooks/mutations/agent";
import { useConversationQuery, useMessagesQuery } from "~/hooks/queries/agent";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { Sparkles } from "~/lib/icons/Sparkles";
import type { Message, MessageAttachment } from "~/lib/models";

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: { attachment?: MessageAttachment };
  isStreaming?: boolean;
};

export default function AgentScreen() {
  const { height } = useGradualAnimation();

  const fakeView = useAnimatedStyle(() => {
    return {
      height: Math.abs(height.value),
    };
  }, []);

  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);

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
    if (!isStreaming && serverMessages && serverMessages.length > 0) {
      const mapped: LocalMessage[] = serverMessages.map((m: Message) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        metadata: m.metadata,
        isStreaming: false,
      }));
      setLocalMessages(mapped);
    }
  }, [isStreaming, serverMessages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isPending || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    const userMsg: LocalMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    const assistantMessageId = `local-assistant-${Date.now()}`;
    const assistantMsg: LocalMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      isStreaming: true,
    };
    setLocalMessages((prev) => [...prev, userMsg, assistantMsg]);

    sendMessage(
      {
        message: text,
        conversationId,
        onChunk: (chunk, nextConversationId) => {
          if (nextConversationId !== conversationId) {
            setConversationId(nextConversationId);
          }

          setLocalMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: message.content + chunk,
                    isStreaming: true,
                  }
                : message,
            ),
          );
        },
      },
      {
        onSuccess: (response) => {
          if (!conversationId && response.conversation_id) {
            setConversationId(response.conversation_id);
          }

          setLocalMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: response.message,
                    isStreaming: false,
                  }
                : message,
            ),
          );
          setIsStreaming(false);

          queryClient.invalidateQueries({ queryKey: ["conversation"] });

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
          setLocalMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: "Sorry, something went wrong. Please try again.",
                    isStreaming: false,
                  }
                : message,
            ),
          );
          setIsStreaming(false);
        },
      },
    );
  }, [conversationId, input, isPending, isStreaming, sendMessage, queryClient]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pt-2 pb-4 border-b border-white/10">
        <HeaderBackButton />
        <H3>AI Agent</H3>
      </View>

      <View style={styles.container}>
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
            data={localMessages}
            renderItem={({ item }: { item: LocalMessage }) => (
              <AgentMessageView
                message={{
                  id: item.id,
                  conversation_id: conversationId ?? "",
                  role: item.role,
                  content: item.content,
                  created_at: item.created_at,
                  metadata: item.metadata,
                }}
                isStreaming={item.isStreaming}
              />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listStyle}
          />
        )}

        {/* Input row */}
        <View className="flex-row items-center gap-3 px-4 py-3 border-t border-white/10">
          <Input
            className="flex-1 bg-card"
            placeholder="Message..."
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!isPending && !isStreaming}
            multiline={false}
          />
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || isPending || isStreaming}
            className={`w-10 h-10 rounded-full items-center justify-center ${
              input.trim() && !isPending && !isStreaming
                ? "bg-primary"
                : "bg-muted"
            }`}
          >
            <ArrowRight
              className={`w-5 h-5 ${
                input.trim() && !isPending && !isStreaming
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            />
          </Pressable>
        </View>
        <Animated.View style={fakeView} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  listStyle: {
    padding: 16,
    gap: 16,
  },
});
