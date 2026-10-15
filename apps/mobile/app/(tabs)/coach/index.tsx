import {
  useEveAgentRuntime,
  useEveError,
  useEveReset,
} from "@assistant-ui/eve";
import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
} from "@assistant-ui/react-native";
import { useUser } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import RevenueCatUI from "react-native-purchases-ui";
import {
  ChatProvider,
  Conversation,
  ConversationScrollButton,
  createStreamingStore,
  messageText,
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
  isRefusedSend,
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
  canResume,
  children,
  userId,
}: {
  /** False for a free User: resuming would only meet the Pro refusal. */
  canResume: boolean;
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
    resume: canResume && saved.session !== undefined,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

type Composer = [string, React.Dispatch<React.SetStateAction<string>>];

function useCoachChat(userId: string, [input, setInput]: Composer) {
  const aui = useAui();
  const threadMessages = useAuiState((s) => s.thread.messages);
  const messages = useMemo(
    () => threadMessages.filter((message) => !isRefusedSend(message)),
    [threadMessages]
  );
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isLoading = useAuiState((s) => s.thread.isLoading);
  const eveError = useEveError();
  const resetSession = useEveReset();
  const streamingStore = useMemo(() => createStreamingStore(), []);
  const prevStreamingTextRef = useRef<string>("");

  // The text of the last send, given back to the composer when the Coach
  // refuses it (paywall, ended session), so it isn't lost.
  const lastSentRef = useRef("");

  const errorAction = coachErrorAction(eveError);

  // A turn that settled without an error was answered: nothing to give back.
  useEffect(() => {
    if (!(isRunning || eveError)) {
      lastSentRef.current = "";
    }
  }, [isRunning, eveError]);

  const isBusy = isRunning || isLoading;

  // Not while a turn runs: a local reset leaves the durable turn running on
  // the Coach, where it could still change a Plan nobody sees anymore.
  const newConversation = useCallback(() => {
    if (isBusy) {
      return;
    }
    clearSavedCoachConversation(userId);
    resetSession();
  }, [isBusy, resetSession, userId]);

  // An effect event, so the paywall opens once per error, not on every render
  // (`useEveReset` returns a new function each time).
  const handleError = useEffectEvent((error: unknown) => {
    const action = coachErrorAction(error);
    if (action !== "paywall" && action !== "new-conversation") {
      return;
    }
    // The refused text goes back into the composer, to send again.
    const refused = lastSentRef.current;
    lastSentRef.current = "";
    setInput((current) => current || refused);
    if (action === "paywall") {
      RevenueCatUI.presentPaywall();
    } else {
      newConversation();
    }
  });

  useEffect(() => {
    handleError(eveError);
  }, [eveError]);

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
      const text = messageText(lastMessage);
      if (text !== prevStreamingTextRef.current) {
        prevStreamingTextRef.current = text;
        streamingStore.set(text);
      }
    }
  }, [messages, isRunning, streamingStore]);

  const sendMessage = useCallback(
    (text: string) => {
      lastSentRef.current = text;
      aui.thread().append({
        content: [{ text, type: "text" }],
        role: "user",
        // Read per send so a model change applies to the next message.
        runConfig: coachRunConfig(getSelectedCoachModelId()),
      });
    },
    [aui]
  );

  const onSend = useCallback(() => {
    if (!input.trim() || isBusy) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(input);
    setInput("");
  }, [input, isBusy, sendMessage, setInput]);

  return {
    error: errorAction === "show" ? toError(eveError) : null,
    input,
    isBusy,
    isGenerating: isRunning,
    isLoading,
    messages,
    newConversation,
    onSend,
    sendMessage,
    setInput,
    streamingStore,
  };
}

function CoachChat({
  composer,
  isPro,
  userId,
}: {
  composer: Composer;
  isPro: boolean | undefined;
  userId: string;
}) {
  const chat = useCoachChat(userId, composer);
  const { model } = useSelectedCoachModel();
  const { initialMessage } = useLocalSearchParams<{
    initialMessage?: string;
  }>();
  const router = useRouter();
  const sentInitialMessageRef = useRef<string | null>(null);

  // Planner prompts take the same Pro gate as typed ones (a refused send
  // would make the Coach cache "not Pro" for minutes, past a purchase), and
  // wait for a resuming or running turn: eve refuses sends meanwhile.
  useEffect(() => {
    if (
      !initialMessage ||
      initialMessage === sentInitialMessageRef.current ||
      (isPro !== false && chat.isBusy)
    ) {
      return;
    }
    sentInitialMessageRef.current = initialMessage;
    router.setParams({ initialMessage: undefined });
    if (isPro === false) {
      chat.setInput(initialMessage);
      RevenueCatUI.presentPaywall();
      return;
    }
    chat.sendMessage(initialMessage);
  }, [initialMessage, isPro, chat, router]);

  const handleSend = useCallback(() => {
    if (isPro === false) {
      RevenueCatUI.presentPaywall();
      return;
    }
    chat.onSend();
  }, [isPro, chat]);

  const { isBusy, newConversation } = chat;

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
              disabled: isBusy,
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
  const { data: isPro, isPending: isProPending } = useIsProQuery();
  // Above the runtime, so a remount after a purchase keeps the draft.
  const composer = useState("");
  // Wait for the entitlement: a free User's saved Conversation must not
  // resume, since every Coach request checks Pro and a refusal is cached.
  if (!user || isProPending) {
    return null;
  }
  const canResume = isPro !== false;
  // Keyed by User and access: a different User gets their own runtime, and
  // buying Pro remounts it so the saved Conversation resumes.
  return (
    <CoachRuntime
      canResume={canResume}
      key={`${user.id}:${canResume}`}
      userId={user.id}
    >
      <CoachChat composer={composer} isPro={isPro} userId={user.id} />
    </CoachRuntime>
  );
}
