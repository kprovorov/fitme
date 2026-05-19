import type { UIMessage } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { fetch as expoFetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { Link, Stack } from "expo-router";
import { Plus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChatProvider,
  Conversation,
  ConversationEmptyState,
  ConversationScrollButton,
  createStreamingStore,
  Message,
  MessageResponse,
  PromptInput,
  PromptInputAction,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  StreamingMessage,
} from "@/components/chat";
import { Icon } from "@/components/icon";
import { supabase } from "~/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

const ATTACHMENTS_ENABLED = false;

function getTextFromParts(
  parts: Array<{ type: string; text?: string }>
): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("");
}

function useAIChat() {
  const [input, setInput] = useState("");
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const prevStreamingTextRef = useRef("");

  const { messages, sendMessage, status, error } = useChat({
    transport: new AssistantChatTransport({
      api: `${SUPABASE_URL}/functions/v1/ai-agent`,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      headers: async () => {
        const { data } = await supabase.auth.getSession();
        return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
      },
    }),
  });

  const isStreaming = status === "streaming";

  // Sync streaming text to the store
  useEffect(() => {
    if (!isStreaming) {
      if (prevStreamingTextRef.current) {
        prevStreamingTextRef.current = "";
        streamingStore.set("");
      }
      return;
    }
    const lastMessage = messages.at(-1);
    if (lastMessage?.role === "assistant") {
      const text = getTextFromParts(
        lastMessage.parts as Array<{ type: string; text?: string }>
      );
      if (text !== prevStreamingTextRef.current) {
        prevStreamingTextRef.current = text;
        streamingStore.set(text);
      }
    }
  }, [messages, isStreaming, streamingStore]);

  const onSend = useCallback(() => {
    if (!input.trim() || isStreaming) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage({ text: input });
    setInput("");
  }, [input, isStreaming, sendMessage]);

  return {
    messages,
    input,
    setInput,
    isGenerating: isStreaming,
    onSend,
    streamingStore,
    error: error ?? null,
  };
}

export default function AgentScreen() {
  const chat = useAIChat();
  const { isGenerating, streamingStore, messages } = chat;

  const renderMessage = useCallback(
    ({ item }: { item: UIMessage }) => {
      const text = getTextFromParts(
        item.parts as Array<{ type: string; text?: string }>
      );

      if (item.role === "user") {
        return <Message from="user">{text}</Message>;
      }

      const isStreaming = isGenerating && item === messages.at(-1);
      return (
        <Message from="assistant">
          {isStreaming ? (
            <StreamingMessage store={streamingStore} />
          ) : (
            <MessageResponse>{text}</MessageResponse>
          )}
        </Message>
      );
    },
    [isGenerating, messages, streamingStore]
  );

  return (
    <>
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
      <ChatProvider value={chat}>
        <Conversation
          emptyState={
            <ConversationEmptyState
              description="Send a message to get started"
              title="Chat"
            />
          }
          renderMessage={renderMessage}
        >
          <ConversationScrollButton />
          <PromptInput>
            {ATTACHMENTS_ENABLED && (
              <Link asChild href="/agent/attachments">
                <PromptInputAction>
                  <Icon className="h-5 w-5 text-muted-foreground" icon={Plus} />
                </PromptInputAction>
              </Link>
            )}
            <PromptInputBody>
              <PromptInputTextarea />
              <PromptInputSubmit />
            </PromptInputBody>
          </PromptInput>
        </Conversation>
      </ChatProvider>
    </>
  );
}
