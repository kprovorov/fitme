import { useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { forwardRef, useCallback, useEffect, useState } from "react";
import {
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  type ScrollViewProps,
  View,
} from "react-native";
import {
  KeyboardChatScrollView,
  type KeyboardChatScrollViewProps,
  KeyboardGestureArea,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSharedValue, withTiming } from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { HStack } from "~/components/ui/hstack";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Text } from "~/components/ui/text";
import { H3, Muted } from "~/components/ui/typography";
import AgentMessageView from "~/components/views/agent-message-view";
import { useSendMessageMutation } from "~/hooks/mutations/agent";
import { useConversationQuery, useMessagesQuery } from "~/hooks/queries/agent";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { Sparkles } from "~/lib/icons/Sparkles";
import type { Message, MessageAttachment } from "~/lib/models";

const SUGGESTIONS = [
  "Create a workout plan for me",
  "How am I progressing this week?",
  "What exercises target my core?",
];

function EmptyState({
  onSuggestion,
}: {
  onSuggestion: (text: string) => void;
}) {
  return (
    <View style={{ transform: [{ scaleY: -1 }] }}>
      <View className="items-center px-6 py-12 gap-6">
        <View className="w-16 h-16 rounded-full bg-primary/20 items-center justify-center">
          <Sparkles className="w-8 h-8 text-primary" />
        </View>
        <View className="items-center gap-2">
          <H3 className="text-center">How can I help?</H3>
          <Muted className="text-center">
            Ask me about workouts, nutrition, or your fitness goals.
          </Muted>
        </View>
        <View className="w-full gap-3">
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => onSuggestion(s)}
              className="border border-white/10 rounded-2xl px-4 py-3 bg-card"
            >
              <Text className="text-sm text-foreground">{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: { attachment?: MessageAttachment };
  isStreaming?: boolean;
};

type Ref = React.ComponentRef<typeof KeyboardChatScrollView>;

const MARGIN = 8;
const INPUT_HEIGHT = 42;
const MAX_INPUT_HEIGHT = 120;

// Wrapper for virtualized lists
const ChatScrollView = forwardRef<
  Ref,
  ScrollViewProps & KeyboardChatScrollViewProps
>((props, ref) => {
  const { bottom } = useSafeAreaInsets();

  return (
    <KeyboardChatScrollView
      ref={ref}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      offset={bottom - MARGIN}
      {...props}
    />
  );
});

ChatScrollView.displayName = "ChatScrollView";

export default function AgentScreen() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_HEIGHT);
  const extraContentPadding = useSharedValue(0);

  const { data: conversation } = useConversationQuery();
  const { data: serverMessages } = useMessagesQuery({
    variables: { conversationId: conversationId ?? "" },
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

  const { bottom } = useSafeAreaInsets();

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isPending || isStreaming) return;

    setInput("");
    setInputHeight(INPUT_HEIGHT);
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

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView {...props} extraContentPadding={extraContentPadding} />
    ),
    [extraContentPadding],
  );

  const onInputLayout = useCallback(
    (e: LayoutChangeEvent) => {
      extraContentPadding.value = withTiming(
        Math.max(e.nativeEvent.layout.height - INPUT_HEIGHT, 0),
        { duration: 250 },
      );
    },
    [extraContentPadding],
  );

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 pt-2 pb-3 border-b border-white/10">
        <HeaderBackButton />
        <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </View>
        <View className="flex-1">
          <H3>AI Agent</H3>
          <Muted className="text-xs leading-tight">Powered by Claude</Muted>
        </View>
      </View>

      <KeyboardGestureArea
        interpolator="ios"
        offset={INPUT_HEIGHT}
        style={{ flex: 1 }}
        textInputNativeID="chat-input"
      >
        <FlatList
          data={[...localMessages].reverse()}
          inverted
          contentContainerStyle={{ paddingTop: INPUT_HEIGHT + MARGIN }}
          keyExtractor={(item) => item.id}
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
          renderScrollComponent={renderScrollComponent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListEmptyComponent={<EmptyState onSuggestion={setInput} />}
        />

        <KeyboardStickyView offset={{ opened: bottom - MARGIN }}>
          <View className="border-t border-white/10 bg-background px-4 py-3">
            <HStack className="justify-stretch gap-2 items-end">
              <Input
                className="flex-1"
                placeholder="Message..."
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                editable={!isPending && !isStreaming}
                nativeID="chat-input"
                multiline
                scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
                onLayout={onInputLayout}
                onContentSizeChange={(e) => {
                  setInputHeight(
                    Math.min(
                      Math.max(e.nativeEvent.contentSize.height, INPUT_HEIGHT),
                      MAX_INPUT_HEIGHT,
                    ),
                  );
                }}
                style={{
                  height: inputHeight,
                  paddingVertical: 12,
                  textAlignVertical: "center",
                }}
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
                {isPending || isStreaming ? (
                  <Spinner size={18} className="text-muted-foreground" />
                ) : (
                  <ArrowRight
                    className={`w-5 h-5 ${
                      input.trim()
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  />
                )}
              </Pressable>
            </HStack>
          </View>
        </KeyboardStickyView>
      </KeyboardGestureArea>
    </SafeAreaView>
  );
}
