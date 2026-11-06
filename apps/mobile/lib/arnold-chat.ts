import type { ThreadMessage } from "@assistant-ui/react-native";
import {
  arnoldErrorCodes,
  defaultAppLanguage,
  isAppLanguage,
} from "@fitme/core";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { z } from "zod";

import { getSelectedArnoldModelId } from "~/lib/arnold-model";
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

export const clearSavedArnoldConversation = (userId: string) => {
  storage.remove(sessionKey(userId));
  storage.remove(eventsKey(userId));
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
  }

  storage.set(sessionKey(userId), JSON.stringify(session));
};
