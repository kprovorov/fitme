import {
  useEveAgentRuntime,
  useEveError,
  useEveReset,
} from "@assistant-ui/eve";
import {
  AssistantRuntimeProvider,
  type TextMessagePart,
  useAui,
  useAuiState,
} from "@assistant-ui/react-native";
import { useUser } from "@clerk/expo";
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
import { getClerk } from "~/lib/clerk";
import {
  COACH_URL,
  clearSavedCoachConversation,
  coachErrorAction,
  coachRunConfig,
  loadSavedCoachConversation,
  saveCoachConversation,
  saveCoachSession,
} from "~/lib/coach-chat";
import {
  getSelectedCoachModelId,
  useSelectedCoachModel,
} from "~/lib/coach-model";

const ATTACHMENTS_ENABLED: boolean = false;

const getCoachToken = async () => (await getClerk().session?.getToken()) ?? "";

/**
 * The Coach runtime for one User. Their current Conversation is saved per
 * User, so reopening the screen resumes it, an answer still streaming
 * included.
 */
function CoachRuntime({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const [saved] = useState(() => loadSavedCoachConversation(userId));
  const runtime = useEveAgentRuntime({
    // Resolved per request, reconnects included: Clerk tokens live ~60 s.
    auth: { bearer: getCoachToken },
    host: COACH_URL,
    initialEvents: saved.events,
    initialSession: saved.session,
    onFinish: (snapshot) => {
      if (snapshot.session) {
        saveCoachConversation(userId, {
          events: snapshot.events,
          session: snapshot.session,
        });
      }
    },
    onSessionChange: (session) => saveCoachSession(userId, session),
    resume: saved.session !== undefined,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

function useCoachChat(userId: string) {
  const aui = useAui();
  const messages = useAuiState((s) => s.thread.messages);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isLoading = useAuiState((s) => s.thread.isLoading);
  const eveError = useEveError();
  const resetSession = useEveReset();
  const [input, setInput] = useState("");
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const prevStreamingTextRef = useRef<string>("");

  const errorAction = coachErrorAction(eveError);

  const newConversation = useCallback(() => {
    clearSavedCoachConversation(userId);
    resetSession();
  }, [resetSession, userId]);

  useEffect(() => {
    if (errorAction === "paywall") {
      RevenueCatUI.presentPaywall();
    } else if (errorAction === "new-conversation") {
      newConversation();
    }
  }, [errorAction, newConversation]);

  // Sync streaming text to the store
  useEffect(() => {
    if (!isRunning) {
      if (prevStreamingTextRef.current) {
        prevStreamingTextRef.current = "";
        streamingStore.set("");
      }
      return;
    }
    const lastMessage = messages.at(-1);
    if (lastMessage?.role === "assistant") {
      const text = lastMessage.content
        .filter((p): p is TextMessagePart => p.type === "text")
        .map((p) => p.text)
        .join("");
      if (text !== prevStreamingTextRef.current) {
        prevStreamingTextRef.current = text;
        streamingStore.set(text);
      }
    }
  }, [messages, isRunning, streamingStore]);

  const sendMessage = useCallback(
    (text: string) => {
      aui.thread().append({
        content: [{ text, type: "text" }],
        role: "user",
        // Read per send so a model change applies to the next message.
        runConfig: coachRunConfig(getSelectedCoachModelId()),
      });
    },
    [aui]
  );

  const isBusy = isRunning || isLoading;

  const onSend = useCallback(() => {
    if (!input.trim() || isBusy) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(input);
    setInput("");
  }, [input, isBusy, sendMessage]);

  return {
    error: errorAction === "show" ? (eveError as Error) : null,
    input,
    isGenerating: isRunning,
    messages,
    newConversation,
    onSend,
    sendMessage,
    setInput,
    streamingStore,
  };
}

function CoachChat({ userId }: { userId: string }) {
  const chat = useCoachChat(userId);
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
      chat.sendMessage(initialMessage);
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

  const { newConversation } = chat;

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
            {
              accessibilityLabel: "New conversation",
              icon: {
                name: "plus",
                type: "sfSymbol",
              },
              label: "New conversation",
              onPress: newConversation,
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

export default function CoachScreen() {
  const { user } = useUser();
  if (!user) {
    return null;
  }
  // Keyed by User: a different User gets their own runtime and Conversation.
  return (
    <CoachRuntime key={user.id} userId={user.id}>
      <CoachChat userId={user.id} />
    </CoachRuntime>
  );
}
