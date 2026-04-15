import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import type React from "react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  type ScrollViewProps,
  TextInput,
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
import { Button } from "~/components/ui/button";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { HStack } from "~/components/ui/hstack";
import { Spinner } from "~/components/ui/spinner";
import { Text } from "~/components/ui/text";
import { H3, Muted } from "~/components/ui/typography";
import AgentMessageView from "~/components/views/agent-message-view";
import ConversationListView from "~/components/views/conversation-list-view";
import { useSendMessageMutation } from "~/hooks/mutations/agent";
import { useConversationQuery, useMessagesQuery } from "~/hooks/queries/agent";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { Ellipsis } from "~/lib/icons/Ellipsis";
import { Sparkles } from "~/lib/icons/Sparkles";
import {
  getExperienceLevelLabel,
  getGoalLabel,
  getPlaceLabel,
} from "~/lib/labels";
import type {
  ExperienceLevel,
  Goal,
  Message,
  MessageAttachment,
  Place,
} from "~/lib/models";

interface PlanRequestParams {
  experience_level: ExperienceLevel;
  frequency: number;
  goal: Goal;
  note?: string;
  place: Place;
  workout_duration: number;
}

function buildPlanRequestMessage(params: PlanRequestParams): string {
  const lines = [
    "Please create a workout plan for me with the following preferences:",
    `- Goal: ${getGoalLabel(params.goal)}`,
    `- Experience level: ${getExperienceLevelLabel(params.experience_level)}`,
    `- Workout duration: ${params.workout_duration} minutes per session`,
    `- Location: ${getPlaceLabel(params.place)}`,
    `- Frequency: ${params.frequency} ${params.frequency === 1 ? "day" : "days"} per week`,
  ];
  if (params.note) {
    lines.push(`- Note: ${params.note}`);
  }
  return lines.join("\n");
}

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
      <View className="items-center gap-6 px-6 py-12">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/20">
          <Sparkles className="h-8 w-8 text-primary" />
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
              className="rounded-2xl border border-white/10 bg-card px-4 py-3"
              key={s}
              onPress={() => onSuggestion(s)}
            >
              <Text className="text-foreground text-sm">{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

interface LocalMessage {
  content: string;
  created_at: string;
  id: string;
  isStreaming?: boolean;
  metadata?: { attachment?: MessageAttachment };
  role: "user" | "assistant";
}

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
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      offset={bottom - MARGIN}
      ref={ref}
      {...props}
    />
  );
});

ChatScrollView.displayName = "ChatScrollView";

export default function AgentScreen() {
  const queryClient = useQueryClient();
  const { planRequest } = useLocalSearchParams<{ planRequest?: string }>();
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const userChoseConversation = useRef(false);
  const planRequestSentRef = useRef(false);
  const [pendingAutoSend, setPendingAutoSend] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConversationListVisible, setIsConversationListVisible] =
    useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_HEIGHT);
  const extraContentPadding = useSharedValue(0);

  const { data: conversation } = useConversationQuery();
  const { data: serverMessages } = useMessagesQuery({
    variables: { conversationId: conversationId ?? "" },
    enabled: !!conversationId,
  });
  const { mutate: sendMessage, isPending } = useSendMessageMutation();

  // Seed active conversation from server on first load only.
  // Skip if the user has explicitly chosen (new or switched) — otherwise
  // setting conversationId to undefined would immediately get overwritten.
  useEffect(() => {
    if (conversation?.id && !conversationId && !userChoseConversation.current) {
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

  // Detect planRequest param and queue an auto-send for a new conversation
  useEffect(() => {
    if (planRequest && !planRequestSentRef.current) {
      planRequestSentRef.current = true;
      userChoseConversation.current = true;
      const params = JSON.parse(planRequest) as PlanRequestParams;
      setPendingAutoSend(buildPlanRequestMessage(params));
      setConversationId(undefined);
      setLocalMessages([]);
      router.setParams({ planRequest: undefined });
    }
  }, [planRequest]);

  const { bottom } = useSafeAreaInsets();

  const handleNewConversation = useCallback(() => {
    userChoseConversation.current = true;
    setConversationId(undefined);
    setLocalMessages([]);
    setIsConversationListVisible(false);
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === conversationId) {
        setIsConversationListVisible(false);
        return;
      }
      userChoseConversation.current = true;
      setConversationId(id);
      setLocalMessages([]);
      setIsStreaming(false);
      setIsConversationListVisible(false);
    },
    [conversationId]
  );

  const handleSend = useCallback(
    (messageOverride?: string) => {
      const text = (messageOverride ?? input).trim();
      if (!text || isPending || isStreaming) {
        return;
      }

      if (!messageOverride) {
        setInput("");
        setInputHeight(INPUT_HEIGHT);
      }
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
                  : message
              )
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
                  : message
              )
            );
            setIsStreaming(false);

            queryClient.invalidateQueries({ queryKey: ["conversation"] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });

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
                  : message
              )
            );
            setIsStreaming(false);
          },
        }
      );
    },
    [conversationId, input, isPending, isStreaming, sendMessage, queryClient]
  );

  // Fire the queued auto-send once state has settled
  useEffect(() => {
    if (pendingAutoSend && !isStreaming && !isPending) {
      const message = pendingAutoSend;
      setPendingAutoSend(null);
      handleSend(message);
    }
  }, [pendingAutoSend, isStreaming, isPending, handleSend]);

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView {...props} extraContentPadding={extraContentPadding} />
    ),
    [extraContentPadding]
  );

  const onInputLayout = useCallback(
    (e: LayoutChangeEvent) => {
      extraContentPadding.value = withTiming(
        Math.max(e.nativeEvent.layout.height - INPUT_HEIGHT, 0),
        { duration: 250 }
      );
    },
    [extraContentPadding]
  );

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="flex-row items-center gap-3 border-white/10 border-b px-4 pt-2 pb-3">
        <HeaderBackButton />
        <View className="h-8 w-8 items-center justify-center rounded-full bg-primary/20">
          <Sparkles className="h-4 w-4 text-primary" />
        </View>
        <View className="flex-1">
          <H3>AI Agent</H3>
          <Muted className="text-xs leading-tight">Powered by Claude</Muted>
        </View>
        <Button
          disabled={isStreaming}
          onPress={() => setIsConversationListVisible(true)}
          shape="pill"
          size="icon-sm"
          variant="ghost"
        >
          <Ellipsis className="text-foreground" size={21} />
        </Button>
      </View>

      <KeyboardGestureArea
        interpolator="ios"
        offset={INPUT_HEIGHT}
        style={{ flex: 1 }}
        textInputNativeID="chat-input"
      >
        <FlatList
          contentContainerStyle={{ paddingTop: INPUT_HEIGHT + MARGIN }}
          data={[...localMessages].reverse()}
          inverted
          keyboardDismissMode="interactive"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState onSuggestion={setInput} />}
          renderItem={({ item }: { item: LocalMessage }) => (
            <AgentMessageView
              isStreaming={item.isStreaming}
              message={{
                id: item.id,
                conversation_id: conversationId ?? "",
                role: item.role,
                content: item.content,
                created_at: item.created_at,
                metadata: item.metadata,
              }}
            />
          )}
          renderScrollComponent={renderScrollComponent}
        />

        <KeyboardStickyView offset={{ opened: bottom - MARGIN }}>
          <View className="border-white/10 border-t bg-background px-4 py-3">
            <HStack className="items-end justify-stretch gap-2">
              <TextInput
                className="flex-1 font-nunito-sans-bold text-foreground text-sm"
                editable={!(isPending || isStreaming)}
                multiline
                nativeID="chat-input"
                onChangeText={setInput}
                onLayout={onInputLayout}
                onSubmitEditing={() => handleSend()}
                placeholder="Message..."
                returnKeyType="send"
                scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
                style={{ paddingVertical: 11 }}
                value={input}
              />
              <Pressable
                className={`h-10 w-10 items-center justify-center rounded-full ${
                  input.trim() && !isPending && !isStreaming
                    ? "bg-primary"
                    : "bg-muted"
                }`}
                disabled={!input.trim() || isPending || isStreaming}
                onPress={() => handleSend()}
              >
                {isPending || isStreaming ? (
                  <Spinner className="text-muted-foreground" size={18} />
                ) : (
                  <ArrowRight
                    className={`h-5 w-5 ${
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
      <ConversationListView
        activeConversationId={conversationId}
        onClose={() => setIsConversationListVisible(false)}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        visible={isConversationListVisible}
      />
    </SafeAreaView>
  );
}
