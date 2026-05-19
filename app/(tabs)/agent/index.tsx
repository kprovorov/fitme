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

const USE_MOCK = process.env.EXPO_PUBLIC_MOCK_AI === "1";

const ATTACHMENTS_ENABLED = false;

const SPLIT_ON_SPACE_REGEX = /(?<=\s)/;

// Throttle interval for streaming UI updates (~30fps)
const STREAMING_THROTTLE_MS = 32;

const MOCK_RESPONSES = [
  "That's a great question! Here's what I think:\n\nThe key insight is that **simplicity** often beats complexity. When you break down the problem into smaller pieces, the solution becomes much clearer.\n\n```javascript\nconst answer = problems\n  .map(simplify)\n  .reduce(combine, []);\n```\n\nHope that helps!",
  "I'd be happy to help with that. Let me walk you through it step by step:\n\n1. **First**, identify the core requirements\n2. **Then**, design the interface\n3. **Finally**, implement and test\n\nThe most important thing is to start simple and iterate. You can always add more features later.",
  "Interesting! Here's a quick overview:\n\n> The best code is the code you don't have to write.\n\nThat said, when you *do* need to write code, keep these principles in mind:\n\n- **Readability** over cleverness\n- **Composition** over inheritance\n- **Explicit** over implicit\n\nLet me know if you want me to dive deeper into any of these!",
  "Sure thing! Here's a concise answer:\n\nThe approach I'd recommend is to use a **streaming architecture** where data flows through the system in real-time. This gives you:\n\n- Lower latency\n- Better resource utilization\n- Simpler error handling\n\n```python\nasync for chunk in stream:\n    process(chunk)\n```\n\nWant me to elaborate on any part?",
];

async function mockStreamResponse(
  text: string,
  onToken: (token: string) => void,
  signal?: AbortSignal
) {
  const words = text.split(SPLIT_ON_SPACE_REGEX);
  for (const word of words) {
    if (signal?.aborted) {
      return;
    }
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
    onToken(word);
  }
}

/** Extract text content from a UIMessage's parts array. */
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

function useMockChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const streamingRef = useRef("");
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mockIndexRef = useRef(0);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isGenerating) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMessage: UIMessage = {
      id: Date.now().toString(),
      role: "user",
      parts: [{ type: "text", text: input.trim() }],
    };

    const assistantMessage: UIMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      parts: [{ type: "text", text: "" }],
    };

    const newMessages = [...messages, userMessage, assistantMessage];
    setMessages(newMessages);
    setInput("");
    setIsGenerating(true);

    streamingRef.current = "";
    streamingStore.set("");

    try {
      const mockText =
        MOCK_RESPONSES[mockIndexRef.current % MOCK_RESPONSES.length];
      mockIndexRef.current++;

      await mockStreamResponse(mockText, (token) => {
        streamingRef.current += token;
        if (!throttleRef.current) {
          throttleRef.current = setTimeout(() => {
            streamingStore.set(streamingRef.current);
            throttleRef.current = null;
          }, STREAMING_THROTTLE_MS);
        }
      });
    } catch (err) {
      console.error("Generation error:", err);
      streamingRef.current = "Error generating response";
    } finally {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      const finalContent = streamingRef.current;
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx] = {
          ...updated[lastIdx],
          parts: [{ type: "text", text: finalContent }],
        };
        return updated;
      });
      streamingRef.current = "";
      streamingStore.set("");
      setIsGenerating(false);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [input, isGenerating, messages, streamingStore]);

  return {
    messages,
    input,
    setInput,
    isGenerating,
    onSend: handleSend,
    streamingStore,
  };
}

export default function AgentScreen() {
  const mockChat = useMockChat();
  const aiChat = useAIChat();
  const chat = USE_MOCK ? mockChat : aiChat;
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
