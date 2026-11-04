import {
  useEveAgentRuntime,
  useEveError,
  useEveEvents,
  useEveReset,
} from "@assistant-ui/eve";
import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
} from "@assistant-ui/react-native";
import type { ThreadMessage } from "@assistant-ui/react-native";
import { useUser } from "@clerk/expo";
import { captureException } from "@sentry/react-native";
import * as Haptics from "expo-haptics";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useSyncExternalStore,
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
import {
  addArnoldAttachments,
  arnoldAttachmentsOwner,
  clearArnoldAttachments,
  removeArnoldAttachment,
  useArnoldAttachments,
  useArnoldAttachmentsOwner,
} from "~/hooks/arnold-attachments";
import type { ArnoldAttachment } from "~/hooks/arnold-attachments";
import { useSelectedArnoldModel } from "~/hooks/arnold-model";
import { useIsProQuery } from "~/hooks/revenueCat";
import { readAttachmentDataUrl } from "~/lib/arnold-attachment-picker";
import { ATTACHMENTS_ENABLED } from "~/lib/arnold-attachments";
import {
  arnoldErrorAction,
  arnoldErrorKind,
  arnoldRunConfig,
  clearSavedArnoldConversation,
  getArnoldUrl,
  isRefusedSend,
  loadSavedArnoldConversation,
  saveArnoldConversation,
  saveArnoldSession,
  shownUserMessage,
} from "~/lib/arnold-chat";
import type { ArnoldErrorKind } from "~/lib/arnold-chat";
import { getClerk } from "~/lib/clerk";
import { segmentClient } from "~/lib/segment";

const getArnoldToken = async () => (await getClerk().session?.getToken()) ?? "";

/**
 * Arnold runtime for one User. Their current Conversation is saved per
 * User, so reopening the screen resumes it, an answer still streaming
 * included.
 */
const ArnoldRuntime = ({
  canResume,
  children,
  userId,
}: {
  /** False for a free User: resuming would only meet the Pro refusal. */
  canResume: boolean;
  children: React.ReactNode;
  userId: string;
}) => {
  const saved = useMemo(() => loadSavedArnoldConversation(userId), [userId]);

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
};

/** The error state's text per kind of error, never the server's message. */
const errorMessageKeys = {
  generic: "arnold.errors.generic",
  network: "arnold.errors.network",
  "pro-check-unavailable": "arnold.errors.proCheckUnavailable",
} as const satisfies Record<ArnoldErrorKind, string>;

type Composer = ReturnType<typeof createStreamingStore>;

const useArnoldChat = (userId: string, composer: Composer) => {
  const input = useSyncExternalStore(composer.subscribe, composer.get);
  const setInput = composer.set;
  const aui = useAui();
  const { t } = useTranslation();
  const threadMessages = useAuiState((s) => s.thread.messages);

  const messages = useMemo(
    () => threadMessages.filter((message) => !isRefusedSend(message)),
    [threadMessages]
  );

  const isRunning = useAuiState((s) => s.thread.isRunning);
  // The Attachments a sent message carried are counted off its turn's echo,
  // which `@assistant-ui/eve` leaves out of the message (`shownUserMessage`).
  const events = useEveEvents();
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

  // Read the current reset callback without retriggering error handling:
  // `useEveReset` returns a new function each time.
  const resetFailedConversation = useEffectEvent(() => newConversation());

  useEffect(() => {
    const action = arnoldErrorAction(eveError);

    if (action === "none") {
      return;
    }

    // The refused text goes back into the composer, to send again.
    const refused = lastSentRef.current;
    lastSentRef.current = "";
    composer.set(composer.get() || refused);

    if (action === "paywall") {
      void RevenueCatUI.presentPaywall();
    } else if (action === "new-conversation") {
      resetFailedConversation();
    }
  }, [composer, eveError]);

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
    async (text: string, attachments: readonly ArnoldAttachment[] = []) => {
      lastSentRef.current = text;
      // The bytes go inline, as `data:` URL file parts after the text
      // (ADR 0018), read from the device only now: the runtime turns an
      // `image` content part into the eve file part Arnold's channel takes.
      let images: string[];

      try {
        images = await Promise.all(
          attachments.map((attachment) => readAttachmentDataUrl(attachment.uri))
        );
      } catch (error) {
        // The cache the re-encoder wrote to can be purged under memory
        // pressure. Nothing has been sent, so the whole message goes back
        // into the composer rather than going out without its photos or
        // being lost without a word.
        captureException(error);
        lastSentRef.current = "";
        composer.set(composer.get() || text);
        addArnoldAttachments(attachments, arnoldAttachmentsOwner());

        return;
      }

      aui.thread.append({
        content: [
          // An image-only message carries no text part at all, rather than
          // an empty one the model would read as a blank question.
          ...(text ? [{ text, type: "text" as const }] : []),
          ...images.map((image) => ({ image, type: "image" as const })),
        ],
        role: "user",
        // Read per send so a model or language change applies to the next message.
        runConfig: arnoldRunConfig(),
      });

      if (attachments.length > 0) {
        // The count only: never the image, its name or its size.
        void segmentClient.track("Arnold Attachment Sent", {
          count: attachments.length,
        });
      }
    },
    [aui, composer]
  );

  const onSend = useCallback(
    (attachments: readonly ArnoldAttachment[] = []) => {
      const text = input.trim();

      // Photos alone are a message: "what is this machine?" can be a photo.
      if ((!text && attachments.length === 0) || isBusy) {
        return;
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Cleared before the files are read, so a second press finds nothing
      // left to send while the first send is still on its way.
      setInput("");
      clearArnoldAttachments();
      void sendMessage(text, attachments);
    },
    [input, isBusy, sendMessage, setInput]
  );

  const userMessage = useCallback(
    (message: ThreadMessage) =>
      shownUserMessage(message, messageText(message), events),
    [events]
  );

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
    userMessage,
  };
};

const ArnoldChat = ({
  composer,
  isPro,
  userId,
}: {
  composer: Composer;
  isPro: boolean | undefined;
  userId: string;
}) => {
  const chat = useArnoldChat(userId, composer);
  // The Attachments picked for the next message live outside this screen:
  // the "+" sheet, a screen away, picks them. They are this User's alone.
  useArnoldAttachmentsOwner(userId);
  const attachments = useArnoldAttachments();
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
      void RevenueCatUI.presentPaywall();

      return;
    }

    void chat.sendMessage(initialMessage);
  }, [initialMessage, isPro, chat, router]);

  const handleSend = useCallback(() => {
    if (isPro === false) {
      void RevenueCatUI.presentPaywall();

      return;
    }

    chat.onSend(attachments);
  }, [attachments, isPro, chat]);

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
      <ChatProvider
        value={{
          ...chat,
          attachments,
          onRemoveAttachment: removeArnoldAttachment,
          onSend: handleSend,
        }}
      >
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
            {ATTACHMENTS_ENABLED ? (
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
            ) : null}
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
};

const ArnoldScreen = () => {
  const { user } = useUser();
  const { data: isPro, isPending: isProPending } = useIsProQuery();
  // Above the runtime, so a remount after a purchase keeps the draft.
  const composer = useMemo(() => createStreamingStore(), []);

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
};

export default ArnoldScreen;
