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
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import RevenueCatUI from "react-native-purchases-ui";
import {
  ChatProvider,
  Conversation,
  ConversationEmptyState,
  ConversationScrollButton,
  createStreamingStore,
  messageText,
  PromptInput,
  PromptInputAction,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/chat";
import { SymbolImage } from "@/components/symbol-image";
import { useSelectedArnoldModel } from "~/hooks/arnold-model";
import { useIsProQuery } from "~/hooks/revenueCat";
import {
  type ArnoldErrorKind,
  arnoldErrorAction,
  arnoldErrorKind,
  arnoldRunConfig,
  clearSavedArnoldConversation,
  getArnoldUrl,
  isRefusedSend,
  loadSavedArnoldConversation,
  saveArnoldConversation,
  saveArnoldSession,
} from "~/lib/arnold-chat";
import { getClerk } from "~/lib/clerk";

const ATTACHMENTS_ENABLED: boolean = false;

const getArnoldToken = async () => (await getClerk().session?.getToken()) ?? "";

/**
 * Arnold runtime for one User. Their current Conversation is saved per
 * User, so reopening the screen resumes it, an answer still streaming
 * included.
 */
function ArnoldRuntime({
  canResume,
  children,
  userId,
}: {
  /** False for a free User: resuming would only meet the Pro refusal. */
  canResume: boolean;
  children: React.ReactNode;
  userId: string;
}) {
  const [saved] = useState(() => loadSavedArnoldConversation(userId));
  const runtime = useEveAgentRuntime({
    // Resolved per request, reconnects included: Clerk tokens live ~60 s.
    auth: { bearer: getArnoldToken },
    host: getArnoldUrl(),
    initialEvents: saved.events,
    initialSession: saved.session,
    onFinish: (snapshot) => {
      if (snapshot.session) {
        saveArnoldConversation(userId, {
          events: snapshot.events,
          session: snapshot.session,
        });
      }
    },
    onSessionChange: (session) => saveArnoldSession(userId, session),
    resume: canResume && saved.session !== undefined,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

/** The error state's text per kind of error, never the server's message. */
const errorMessageKeys = {
  generic: "arnold.errors.generic",
  network: "arnold.errors.network",
  "pro-check-unavailable": "arnold.errors.proCheckUnavailable",
} as const satisfies Record<ArnoldErrorKind, string>;

type Composer = [string, React.Dispatch<React.SetStateAction<string>>];

function useArnoldChat(userId: string, [input, setInput]: Composer) {
  const aui = useAui();
  const { t } = useTranslation();
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

  // The text of the last send, given back to the composer when Arnold
  // refuses it or it fails (its placeholder bubble is hidden), so it isn't
  // lost. Cleared once a turn settles, so an answered prompt never returns.
  const lastSentRef = useRef("");

  const errorAction = arnoldErrorAction(eveError);

  // A turn that settled without an error was answered: nothing to give back.
  useEffect(() => {
    if (!(isRunning || eveError)) {
      lastSentRef.current = "";
    }
  }, [isRunning, eveError]);

  const isBusy = isRunning || isLoading;

  // Not while a turn runs: a local reset leaves the durable turn running on
  // Arnold, where it could still change a Plan nobody sees anymore.
  const newConversation = useCallback(() => {
    if (isBusy) {
      return;
    }
    clearSavedArnoldConversation(userId);
    resetSession();
  }, [isBusy, resetSession, userId]);

  // An effect event, so the paywall opens once per error, not on every render
  // (`useEveReset` returns a new function each time).
  const handleError = useEffectEvent((error: unknown) => {
    const action = arnoldErrorAction(error);
    if (action === "none") {
      return;
    }
    // The refused text goes back into the composer, to send again.
    const refused = lastSentRef.current;
    lastSentRef.current = "";
    setInput((current) => current || refused);
    if (action === "paywall") {
      RevenueCatUI.presentPaywall();
    } else if (action === "new-conversation") {
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
        // Read per send so a model or language change applies to the next message.
        runConfig: arnoldRunConfig(),
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
    errorMessage:
      errorAction === "show"
        ? t(errorMessageKeys[arnoldErrorKind(eveError)])
        : null,
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

function ArnoldChat({
  composer,
  isPro,
  userId,
}: {
  composer: Composer;
  isPro: boolean | undefined;
  userId: string;
}) {
  const chat = useArnoldChat(userId, composer);
  const { t } = useTranslation();
  const { model } = useSelectedArnoldModel();
  const { initialMessage } = useLocalSearchParams<{
    initialMessage?: string;
  }>();
  const router = useRouter();
  const sentInitialMessageRef = useRef<string | null>(null);

  // Planner prompts take the same Pro gate as typed ones (a refused send
  // would make Arnold cache "not Pro" for minutes, past a purchase), and
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
          title: t("arnold.title"),
          unstable_headerRightItems: () => [
            {
              icon: {
                name: "cpu",
                type: "sfSymbol",
              },
              label: model?.label ?? t("arnold.model"),
              onPress: () => {
                router.push("/arnold/model-picker");
              },
              type: "button",
            },
            {
              accessibilityLabel: t("arnold.newConversation"),
              disabled: isBusy,
              icon: {
                name: "plus",
                type: "sfSymbol",
              },
              label: t("arnold.newConversation"),
              onPress: newConversation,
              type: "button",
            },
          ],
        }}
      />
      <ChatProvider value={{ ...chat, onSend: handleSend }}>
        <Conversation
          emptyState={
            <ConversationEmptyState
              description={t("arnold.emptyState.description")}
              title={t("arnold.emptyState.title")}
            />
          }
        >
          <ConversationScrollButton />
          <PromptInput>
            {ATTACHMENTS_ENABLED && (
              <Link asChild href="/arnold/attachments">
                <PromptInputAction
                  accessibilityLabel={t("arnold.composer.addToChat")}
                >
                  <SymbolImage
                    className="text-body text-muted-foreground"
                    name="plus"
                  />
                </PromptInputAction>
              </Link>
            )}
            <PromptInputBody>
              <PromptInputTextarea
                placeholder={t("arnold.composer.placeholder")}
              />
              <PromptInputSubmit />
            </PromptInputBody>
          </PromptInput>
        </Conversation>
      </ChatProvider>
    </>
  );
}

export default function ArnoldScreen() {
  const { user } = useUser();
  const { data: isPro, isPending: isProPending } = useIsProQuery();
  // Above the runtime, so a remount after a purchase keeps the draft.
  const composer = useState("");
  // Wait for the entitlement: a free User's saved Conversation must not
  // resume, since every Arnold request checks Pro and a refusal is cached.
  if (!user || isProPending) {
    return null;
  }
  const canResume = isPro !== false;
  // Keyed by User and access: a different User gets their own runtime, and
  // buying Pro remounts it so the saved Conversation resumes.
  return (
    <ArnoldRuntime
      canResume={canResume}
      key={`${user.id}:${canResume}`}
      userId={user.id}
    >
      <ArnoldChat composer={composer} isPro={isPro} userId={user.id} />
    </ArnoldRuntime>
  );
}
