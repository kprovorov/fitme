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
  savedArnoldSessionId,
  shownUserMessage,
} from "~/lib/arnold-chat";
import type { ArnoldErrorKind } from "~/lib/arnold-chat";
import {
  dropSentAttachments,
  keepSentAttachments,
} from "~/lib/arnold-sent-attachments";
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

  // The last send, given back to the composer when Arnold refuses it or it
  // fails (its placeholder bubble is hidden), so neither its text nor its
  // Attachments are lost and the User sends again without re-picking a
  // photo. `owner` is who the photos belonged to when it went, so a send
  // that outlives its User hands them to nobody (`addArnoldAttachments`).
  // `copies` and `sessionId` are the device copies it wrote (ADR 0018),
  // which come back off the device with it: no message names them, and a
  // retry writes its own. Cleared once a turn settles, so an answered
  // prompt never returns.
  const lastSentRef = useRef<{
    attachments: readonly ArnoldAttachment[];
    copies: readonly string[];
    owner: string | null;
    sessionId: string | undefined;
    text: string;
  } | null>(null);

  // Which Conversation the screen is on: bumped whenever one replaces it.
  const conversationRef = useRef(0);

  const errorAction = arnoldErrorAction(eveError);

  // A turn that settled without an error was answered: nothing to give back.
  useEffect(() => {
    if (!(isRunning || eveError)) {
      lastSentRef.current = null;
    }
  }, [isRunning, eveError]);

  const isBusy = isRunning || isLoading;

  // Not while a turn runs: a local reset leaves the durable turn running on
  // Arnold, where it could still change a Plan nobody sees anymore.
  const newConversation = useCallback(() => {
    if (isBusy) {
      return;
    }

    // A send reading its photos has no turn yet, so it isn't busy and this
    // button is live: counting the Conversations it has outlived is how it
    // knows not to land in the one started without it.
    conversationRef.current += 1;
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

    // The refused message goes back into the composer, to send again: its
    // text, and its Attachments as the thumbnails they were. Nothing of it
    // was stored off the device, and the copies it kept on it come back
    // too, since no message of the Conversation names them and the retry
    // writes its own (ADR 0018).
    const refused = lastSentRef.current;
    lastSentRef.current = null;

    if (refused) {
      composer.set(composer.get() || refused.text);
      addArnoldAttachments(refused.attachments, refused.owner);
      dropSentAttachments(userId, refused.sessionId, refused.copies);
    }

    if (action === "paywall") {
      void RevenueCatUI.presentPaywall();
    } else if (action === "new-conversation") {
      resetFailedConversation();
    }
  }, [composer, eveError, userId]);

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
      // Who the photos belong to, read before the files are: reading them
      // takes a moment, and a User who signs out meanwhile must not have
      // them handed back to whoever signs in next.
      const sentBy = arnoldAttachmentsOwner();
      // The Conversation the copies go under, read before the awaits with
      // the owner, so a reset meanwhile can't send them somewhere else.
      const sessionId = savedArnoldSessionId(userId);
      lastSentRef.current = {
        attachments,
        copies: [],
        owner: sentBy,
        sessionId,
        text,
      };
      const conversation = conversationRef.current;
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
        lastSentRef.current = null;

        // Not into a Conversation started since: the message belongs to the
        // one the User left, and so do its photos.
        if (conversation === conversationRef.current) {
          composer.set(composer.get() || text);
          addArnoldAttachments(attachments, sentBy);
        }

        return;
      }

      // eve echoes an Attachment's metadata, never its bytes, so the bubble
      // is drawn from a copy this device keeps (ADR 0018). Each copy is
      // named after the `filename` its part carries, which the echo brings
      // back, so a reopened Conversation finds its own photos again. It
      // never throws: a copy the device refuses costs a thumbnail, never
      // the message.
      const copies = await keepSentAttachments(
        userId,
        sessionId,
        attachments.map((attachment) => attachment.uri)
      );

      // Remembered with the message, so a refusal takes them back off the
      // device along with giving its photos back to the composer.
      lastSentRef.current = {
        attachments,
        copies,
        owner: sentBy,
        sessionId,
        text,
      };

      // Checked after both awaits, the photos' read and their copy, so a
      // Conversation the User left while either ran takes the message with
      // it, and the copies it had already written come back off the device.
      if (conversation !== conversationRef.current) {
        // The User started a new Conversation while the photos were being
        // read. This message was for the one they left, so it goes nowhere.
        lastSentRef.current = null;
        dropSentAttachments(userId, sessionId, copies);

        return;
      }

      aui.thread.append({
        content: [
          // An image-only message carries no text part at all, rather than
          // an empty one the model would read as a blank question.
          ...(text ? [{ text, type: "text" as const }] : []),
          ...images.map((image, index) => ({
            filename: copies[index],
            image,
            type: "image" as const,
          })),
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
    [aui, composer, userId]
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
