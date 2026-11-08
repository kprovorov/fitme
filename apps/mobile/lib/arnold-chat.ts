import type { ThreadMessage } from "@assistant-ui/react-native";
import {
  arnoldErrorCodes,
  defaultAppLanguage,
  isAppLanguage,
} from "@fitme/core";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { z } from "zod";

import { getSelectedArnoldModelId } from "~/lib/arnold-model";
import {
  followSentAttachments,
  forgetSentAttachments,
} from "~/lib/arnold-sent-attachments";
import { i18n } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";

/**
 * Arnold's (`apps/arnold`) base URL; its eve routes live under `/eve/v1`.
 * `EXPO_PUBLIC_ARNOLD_URL`, empty when unset. Read on each call so tests can
 * set it.
 */
export const getArnoldUrl = () => process.env.EXPO_PUBLIC_ARNOLD_URL || "";

/**
 * The run config each turn with Arnold is sent with, read at send time so a
 * model or App language change applies to the next message. eve forwards
 * `custom` as the turn's client context, where Arnold reads the model to
 * answer with and the App language to answer in when a message doesn't make
 * its language clear. Without a model (no model list on the device) only the
 * language is sent, so Arnold picks its own default model.
 */
export const arnoldRunConfig = () => {
  const model = getSelectedArnoldModelId();

  const language = isAppLanguage(i18n.language)
    ? i18n.language
    : defaultAppLanguage;

  return { custom: model ? { language, model } : { language } };
};

/**
 * eve codes for a session that can't take turns anymore: reset (account
 * deletion), past Arnold's 30-day timeout, or built by another eve version.
 */
const endedSessionCodes: ReadonlySet<string> = new Set([
  "session_expired",
  "session_not_active",
  "session_stranded",
]);

export type ArnoldErrorAction =
  | "new-conversation"
  | "none"
  | "paywall"
  | "show";

/** The `code` eve's `ClientError` reads from Arnold's JSON body, if any. */
const hasErrorCode = (error: unknown): error is { code: string } =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string";

// Decode Eve's error at the boundary before choosing a UI action or message.
const arnoldErrorSchema = z.unknown().transform((value) => ({
  code: hasErrorCode(value) ? value.code : undefined,
  exception: value instanceof Error ? value : undefined,
  present: Boolean(value),
}));

type ArnoldError = z.output<typeof arnoldErrorSchema>;

/**
 * What the Arnold screen does with an error from Arnold: the channel's
 * not-Pro refusal (`arnold_pro_required`) shows the paywall, an ended session
 * starts a new Conversation, and anything else shows the error state. Duck-typed on eve's `ClientError` (`code` from
 * the JSON body) so the app doesn't bundle `eve/client` for an `instanceof`.
 */
export const arnoldErrorAction = z
  .function({ input: [arnoldErrorSchema] })
  .implement(({ code, present }: ArnoldError): ArnoldErrorAction => {
    if (!present) {
      return "none";
    }

    if (code === arnoldErrorCodes.proRequired) {
      return "paywall";
    }

    if (code && endedSessionCodes.has(code)) {
      return "new-conversation";
    }

    return "show";
  });

export type ArnoldErrorKind = "generic" | "network" | "pro-check-unavailable";

/**
 * Which of its own messages the Arnold screen shows for an error it shows
 * (`arnoldErrorAction` → `show`), so the server's English text never reaches
 * the User: the Pro check being unavailable (`arnold_pro_check_unavailable`),
 * a send that never reached Arnold (expo/fetch's `FetchError`, whose message
 * starts `fetch failed:`, or React Native's fetch's `Network request failed`),
 * and anything else, a bug's `TypeError` included.
 */
export const arnoldErrorKind = z
  .function({ input: [arnoldErrorSchema] })
  .implement(({ code, exception }: ArnoldError): ArnoldErrorKind => {
    if (code === arnoldErrorCodes.proCheckUnavailable) {
      return "pro-check-unavailable";
    }

    if (
      exception &&
      (exception.message.startsWith("fetch failed:") ||
        exception.message === "Network request failed")
    ) {
      return "network";
    }

    return "generic";
  });

/**
 * eve keeps a refused send in the thread as a failed user message (its
 * metadata `status`). The screen gives that text back to the composer, so it
 * hides the placeholder rather than show a request that never went through.
 */
export const isRefusedSend = (message: ThreadMessage): boolean =>
  message.role === "user" && message.metadata.custom.status === "failed";

/**
 * eve's own placeholder for a part it can't write out as text, one per line
 * of the summary it shows while a send is on its way (`[file]`, or
 * `[file: <name>]` for a file it was given a name for).
 */
const FILE_PLACEHOLDER_LINE = /^\[file(?::[^\]]*)?\]$/u;

/** What the User's bubble shows for a message of theirs. */
export interface ShownUserMessage {
  /** How many Attachments it carried, so the bubble stands one tile per one. */
  attachmentCount: number;
  /** Its own text, with nothing of eve's in it. */
  text: string;
}

/**
 * What to show for a user message: its text, and how many Attachments it
 * carried (ADR 0018). Neither is simply read off the message, since eve
 * writes a sent Attachment two different ways:
 *
 * - until Arnold echoes it, the message is eve's own summary of what was
 *   sent, one `[file]` line per Attachment and no file part at all, so the
 *   lines are counted and taken out: the User wrote neither;
 * - once echoed, the text is the User's alone and the file parts carry
 *   metadata only (eve never sends an Attachment's bytes back), which
 *   `@assistant-ui/eve` drops for want of a URL — so they are counted off
 *   the turn's `message.received` event instead, which the saved Conversation
 *   keeps, so a reopened screen counts them too.
 *
 * `text` is the message's own text parts joined, which the caller has.
 */
export const shownUserMessage = (
  message: ThreadMessage,
  text: string,
  events: readonly MessageStreamEvent[]
): ShownUserMessage => {
  if (message.metadata.custom.optimistic === true) {
    // Only the trailing ones: eve writes the text parts first and a line
    // per file after them, so a `[file]` the User typed themselves, which
    // is theirs to see, is anywhere else.
    const lines = text.split("\n");
    let own = lines.length;

    while (own > 0 && FILE_PLACEHOLDER_LINE.test(lines[own - 1] ?? "")) {
      own -= 1;
    }

    return {
      attachmentCount: lines.length - own,
      text: lines.slice(0, own).join("\n"),
    };
  }

  const { turnId } = message.metadata.custom;

  const echo = events.find(
    (event) => event.type === "message.received" && event.data.turnId === turnId
  );

  const parts =
    echo?.type === "message.received" ? (echo.data.parts ?? []) : [];

  return {
    attachmentCount: parts.filter((part) => part.type === "file").length,
    text,
  };
};

/**
 * Every Attachment name the Conversation's own messages carry: the
 * `filename`s of the file parts eve echoed back, which are the device copies
 * a bubble is drawn from (ADR 0018).
 *
 * It is what tells an acknowledged send from one that went nowhere. A turn
 * can fail *after* eve has echoed its message, which leaves the message in
 * the Conversation while the screen still treats the send as refused, so the
 * copies it wrote may only be dropped when no message names them.
 */
export const echoedAttachmentNames = (
  events: readonly MessageStreamEvent[]
): ReadonlySet<string> => {
  const names = new Set<string>();

  for (const event of events) {
    if (event.type !== "message.received") {
      continue;
    }

    for (const part of event.data.parts ?? []) {
      if (part.type === "file" && part.filename) {
        names.add(part.filename);
      }
    }
  }

  return names;
};

/** The User's current Conversation, enough for eve to resume it. */
export interface SavedArnoldConversation {
  /** An ordered prefix of the session's stream, to render before resuming. */
  events?: readonly MessageStreamEvent[];
  session?: ClientSessionState;
}

// Two keys, so the cursor (saved on every streamed event) never rewrites the
// event log (saved once per finished turn).
const sessionKey = (userId: string) => `arnold.conversation.${userId}.session`;
const eventsKey = (userId: string) => `arnold.conversation.${userId}.events`;

const readJson = <T>(key: string): T | undefined => {
  const raw = storage.getString(key);

  if (!raw) {
    return;
  }

  let value: T | undefined;

  try {
    // SAFETY: Callers pair each private key with the type serialized to it by
    // this module's save helpers; parsing checks JSON syntax, not its shape.
    value = JSON.parse(raw) as T;
  } catch {
    // An unreadable value counts as nothing saved.
    value = undefined;
  }

  return value;
};

export const loadSavedArnoldConversation = (
  userId: string
): SavedArnoldConversation => {
  const session = readJson<ClientSessionState>(sessionKey(userId));

  if (!session) {
    return {};
  }

  const events = readJson<MessageStreamEvent[]>(eventsKey(userId));

  return events ? { events, session } : { session };
};

/**
 * The eve session the User's saved Conversation is on, which a send keeps its
 * Attachments' device copies under; `undefined` before eve has named one (the
 * first message of a Conversation) or with no Conversation saved.
 */
export const savedArnoldSessionId = (userId: string): string | undefined =>
  readJson<ClientSessionState>(sessionKey(userId))?.sessionId;

export const clearSavedArnoldConversation = (userId: string) => {
  storage.remove(sessionKey(userId));
  storage.remove(eventsKey(userId));
  // The Conversation is forgotten, so its Attachments go with it (ADR 0018).
  forgetSentAttachments(userId);
};

export const saveArnoldConversation = (
  userId: string,
  { events, session }: SavedArnoldConversation
) => {
  if (!session) {
    clearSavedArnoldConversation(userId);

    return;
  }

  storage.set(sessionKey(userId), JSON.stringify(session));

  if (events) {
    storage.set(eventsKey(userId), JSON.stringify(events));
  } else {
    storage.remove(eventsKey(userId));
  }
};

/**
 * Records the session cursor as soon as eve reports it, so a screen reopened
 * mid-answer resumes it. Saved events stay while the session is the same one;
 * no session (a reset) forgets the Conversation.
 *
 * A session eve has just named takes the Attachments sent before it had a
 * name, and one replacing the saved session takes the copies of the
 * Conversation it replaced away with it (ADR 0018).
 */
export const saveArnoldSession = (
  userId: string,
  session: ClientSessionState | undefined
) => {
  if (!session) {
    clearSavedArnoldConversation(userId);

    return;
  }

  const saved = readJson<ClientSessionState>(sessionKey(userId));

  if (saved?.sessionId !== session.sessionId) {
    storage.remove(eventsKey(userId));
    followSentAttachments(userId, session.sessionId);
  }

  storage.set(sessionKey(userId), JSON.stringify(session));
};
