import {
  useEveAgentRuntime,
  useEveError,
  useEveEvents,
  useEveReset,
  useEveSession,
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
  conversationHasRoomFor,
  markAttachmentsSending,
  releaseSendingAttachments,
  removeArnoldAttachment,
  setConversationAttachmentCount,
  useArnoldAttachments,
  useArnoldAttachmentsOwner,
  useIsConversationFull,
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
  echoedAttachmentNames,
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
  sentAttachmentUri,
} from "~/lib/arnold-sent-attachments";
import { getClerk } from "~/lib/clerk";
import { segmentClient } from "~/lib/segment";

const getArnoldToken = async () => (await getClerk().session?.getToken()) ?? "";

/** A resolver for a read that only counts Attachments: it finds no file. */
const NO_ATTACHMENT_URI = () => undefined;

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
  // A sent message's Attachments are read off its turn's echo, which
  // `@assistant-ui/eve` leaves out of the message (`shownUserMessage`), and
  // drawn from the copies this device keeps under the Conversation they were
  // sent in. The session id comes from the runtime, so the bubbles follow
  // the Conversation: eve names a new session while its first message is
  // already on screen, and `saveArnoldSession` moves that message's copies
  // under it in the same call, before this render (ADR 0018).
  const events = useEveEvents();
  const sessionId = useEveSession()?.sessionId;
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
  // `copies` are the device copies it wrote (ADR 0018), which come back off
  // the device with it when no message of the Conversation names them.
  // Cleared once a turn settles, so an answered prompt never returns.
  const lastSentRef = useRef<{
    attachments: readonly ArnoldAttachment[];
    copies: readonly string[];
    owner: string | null;
    text: string;
  } | null>(null);

  // Which Conversation the screen is on: bumped whenever one replaces it.
  const conversationRef = useRef(0);

  // Every Attachment the Conversation carries, counted exactly as the bubbles
  // show them, so a send still on its way counts before Arnold echoes it and
  // a reopened screen counts what the saved event log replayed. eve resends
  // each one on every model call, hence the cap (ADR 0018).
  const conversationAttachments = useMemo(() => {
    let total = 0;

    for (const message of messages) {
      if (message.role === "user") {
        total += shownUserMessage(
          message,
          messageText(message),
          events,
          // How many it carried is all the cap needs, and resolving a name
          // is a file check (`uriOf`), so nothing is looked for here.
          NO_ATTACHMENT_URI
        ).attachments.length;
      }
    }

    return total;
  }, [events, messages]);

  // The "+" sheet is a screen of its own, outside this runtime, so it reads
  // the count from the store rather than the Conversation. Declared before
  // the error handling below, so that by the time a refused send's
  // Attachments are given back the Conversation has stopped counting them
  // and there is room for them in the composer.
  useEffect(() => {
    setConversationAttachmentCount(conversationAttachments);
  }, [conversationAttachments]);

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

  // The device copies of a send that errored, dropped only where no message
  // of the Conversation names them (ADR 0018). A turn can fail *after* eve
  // has echoed its message, which leaves that message in the Conversation
  // and in its saved events: its photos are still the ones its bubble
  // shows, so they stay. An `useEffectEvent`, so the error effect reads the
  // latest events without rerunning on each one.
  const dropUnnamedCopies = useEffectEvent((copies: readonly string[]) => {
    const named = echoedAttachmentNames(events);

    dropSentAttachments(
      userId,
      copies.filter((name) => !named.has(name))
    );
  });

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
      dropUnnamedCopies(refused.copies);
    }

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
      // Who the photos belong to, read before the files are: reading them
      // takes a moment, and a User who signs out meanwhile must not have
      // them handed back to whoever signs in next.
      const sentBy = arnoldAttachmentsOwner();
      // The Conversation the copies go under, read before the awaits with
      // the owner, so a reset meanwhile can't send them somewhere else.
      const sentUnder = savedArnoldSessionId(userId);
      lastSentRef.current = { attachments, copies: [], owner: sentBy, text };
      const conversation = conversationRef.current;
      // The composer has let go of these and the Conversation hasn't got
      // them yet, so their slots are held until one of the two is true
      // again: nothing else may take what this message is about to fill.
      markAttachmentsSending(attachments.length, sentBy);
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
        // Given back before the photos are, or there would be no room left
        // for the very photos that are going back into the composer.
        releaseSendingAttachments(attachments.length, sentBy);

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
        sentUnder,
        attachments.map((attachment) => attachment.uri)
      );

      // Remembered with the message, so a refusal takes them back off the
      // device along with giving its photos back to the composer.
      lastSentRef.current = { attachments, copies, owner: sentBy, text };

      // Checked after both awaits, the photos' read and their copy, so a
      // Conversation the User left while either ran takes the message with
      // it, and the copies it had already written come back off the device.
      if (conversation !== conversationRef.current) {
        // The User started a new Conversation while the photos were being
        // read. This message was for the one they left, so it goes nowhere.
        lastSentRef.current = null;
        dropSentAttachments(userId, copies);
        releaseSendingAttachments(attachments.length, sentBy);

        return;
      }

      // From here the Conversation carries them: its own count, synced
      // below, takes over the hold.
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

      // The Conversation's cap is the app's alone to keep (ADR 0018), so no
      // send may walk past it: the server would only find out by having a
      // turn cancelled mid-answer. Unreachable while the composer counts
      // them too, and the backstop if it ever doesn't.
      if (
        attachments.length > 0 &&
        !conversationHasRoomFor(attachments.length)
      ) {
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

  // Where each copy of this Conversation's is, looked up once per name:
  // asking the device is a file check, and every bubble on screen is drawn
  // again on each streamed chunk. A copy's place doesn't change while the
  // Conversation does not, so the answers are kept until it does.
  // Kept under the Conversation they were looked up in, since a new one, or
  // another User, puts the copies somewhere else.
  const foundUris = useRef({
    conversation: "",
    uris: new Map<string, string | undefined>(),
  });

  const uriOf = useCallback(
    (name: string) => {
      const conversation = `${userId}\n${sessionId ?? ""}`;
      let found = foundUris.current;

      if (found.conversation !== conversation) {
        found = { conversation, uris: new Map() };
        foundUris.current = found;
      }

      if (!found.uris.has(name)) {
        found.uris.set(name, sentAttachmentUri(userId, sessionId, name));
      }

      return found.uris.get(name);
    },
    [sessionId, userId]
  );

  const userMessage = useCallback(
    (message: ThreadMessage) =>
      shownUserMessage(message, messageText(message), events, uriOf),
    [events, uriOf]
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
  // The Conversation's own cap, counting what's picked: at it, "+" is
  // disabled and the composer offers a new Conversation (ADR 0018).
  const isConversationFull = useIsConversationFull();
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
          isConversationFull,
          onNewConversation: newConversation,
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
                {/* Disabled once the Conversation is full of photos: the
                    sheet would have nothing to offer, so the composer says
                    why and offers a new Conversation instead. */}
                <PromptInputAction
                  accessibilityLabel={t("arnold.composer.addToChat")}
                  disabled={isConversationFull}
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
