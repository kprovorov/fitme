import { useChat } from "@ai-sdk/react";
import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { fetch as expoFetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RevenueCatUI from "react-native-purchases-ui";
import {
  ChatProvider,
  Conversation,
  ConversationScrollButton,
  createStreamingStore,
  PromptInput,
  PromptInputAction,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/chat";
import { Icon } from "@/components/icon";
import { useIsProQuery } from "~/hooks/revenueCat";
import {
  getSelectedCoachModelId,
  useSelectedCoachModel,
} from "~/lib/coach-model";
import { supabase } from "~/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

const ATTACHMENTS_ENABLED = false;

function useAIChat() {
  const [input, setInput] = useState("");
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const prevStreamingTextRef = useRef("");

  const { messages, sendMessage, status, error } = useChat({
    transport: new AssistantChatTransport({
      api: `${SUPABASE_URL}/functions/v1/ai-agent`,
      // Resolved per request so a model change applies to the next message.
      body: () => ({ model: getSelectedCoachModelId() }),
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
      const text = lastMessage.parts
        .filter(
          (p): p is { type: "text"; text: string } =>
            p.type === "text" && "text" in p
        )
        .map((p) => p.text)
        .join("");
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
    error: error ?? null,
    input,
    isGenerating: isStreaming,
    messages,
    onSend,
    sendMessage,
    setInput,
    streamingStore,
  };
}

export default function CoachScreen() {
  const chat = useAIChat();
  const { data: isPro } = useIsProQuery();
  const { model } = useSelectedCoachModel();
  const { initialMessage } = useLocalSearchParams<{
    initialMessage?: string;
  }>();
  const router = useRouter();
  const sentInitialMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialMessage && initialMessage !== sentInitialMessageRef.current) {
      sentInitialMessageRef.current = initialMessage;
      chat.sendMessage({ text: initialMessage });
      router.setParams({ initialMessage: undefined });
    }
  }, [initialMessage, chat, router]);

  const handleSend = useCallback(() => {
    if (isPro === false) {
      RevenueCatUI.presentPaywall();
      return;
    }
    chat.onSend();
  }, [isPro, chat]);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: "Coach",
          unstable_headerRightItems: () => [
            {
              icon: {
                name: "cpu",
                type: "sfSymbol",
              },
              label: model.label,
              onPress: () => {
                router.push("/coach/model-picker");
              },
              type: "button",
            },
          ],
        }}
      />
      <ChatProvider value={{ ...chat, onSend: handleSend }}>
        <Conversation>
          <ConversationScrollButton />
          <PromptInput>
            {ATTACHMENTS_ENABLED && (
              <Link asChild href="/coach/attachments">
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
