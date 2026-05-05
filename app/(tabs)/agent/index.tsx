import { useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Composer,
  ComposerInput,
  ComposerSendButton,
} from "~/components/views/composer";
import { ComposerProvider } from "~/components/views/composer-context";
import type { LocalMessage } from "~/components/views/message-list";
import { MessageList } from "~/components/views/message-list";
import { useSendMessageMutation } from "~/hooks/mutations/agent";
import { useConversationQuery, useMessagesQuery } from "~/hooks/queries/agent";
import {
  getExperienceLevelLabel,
  getGoalLabel,
  getPlaceLabel,
} from "~/lib/labels";
import type { ExperienceLevel, Goal, Message, Place } from "~/lib/models";

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
        isNew: false,
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

  const handleSend = useCallback(
    (messageOverride?: string) => {
      const text = (messageOverride ?? input).trim();
      if (!text || isPending || isStreaming) {
        return;
      }

      if (!messageOverride) {
        setInput("");
      }
      setIsStreaming(true);

      const userMsg: LocalMessage = {
        id: `local-user-${Date.now()}`,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
        isNew: true,
      };
      const assistantMessageId = `local-assistant-${Date.now()}`;
      const assistantMsg: LocalMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
        isStreaming: true,
        isNew: true,
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

  return (
    <ComposerProvider
      isPending={isPending}
      isStreaming={isStreaming}
      onChangeText={setInput}
      onSend={handleSend}
      value={input}
    >
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Agent",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <MessageList
        conversationId={conversationId}
        messages={localMessages}
        onSuggestion={setInput}
      />
      <Composer>
        <ComposerInput />
        <ComposerSendButton />
      </Composer>
    </ComposerProvider>
  );
}
