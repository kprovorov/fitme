import type { ThreadMessage } from "@assistant-ui/react-native";
import { isArnoldRefusal } from "@fitme/core";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { storage } from "~/lib/mmkv";

/**
 * Arnold's (`apps/arnold`) base URL; its eve routes live under `/eve/v1`.
 * `EXPO_PUBLIC_ARNOLD_URL`, falling back to the pre-rename
 * `EXPO_PUBLIC_COACH_URL` while builds are still configured with it; empty
 * when neither is set. Read on each call so tests can set it.
 */
export const getArnoldUrl = () =>
  process.env.EXPO_PUBLIC_ARNOLD_URL || process.env.EXPO_PUBLIC_COACH_URL || "";

/**
 * The run config each turn with Arnold is sent with. eve forwards `custom` as the
 * turn's client context, where Arnold reads the model to answer with.
 * Without a model (no model list on the device) nothing is sent, so Arnold
 * picks its own default.
 */
export function arnoldRunConfig(model: string | undefined) {
  return model ? { custom: { model } } : {};
}

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

/**
 * What the Arnold screen does with an error from Arnold: the channel's not-Pro refusal
 * (`arnold_pro_required` or the pre-rename `coach_pro_required`) shows the
 * paywall, an ended session starts a new Conversation, and anything
 * else shows the error state. Duck-typed on eve's `ClientError` (`code` from
 * the JSON body) so the app doesn't bundle `eve/client` for an `instanceof`.
 */
export function arnoldErrorAction(error: unknown): ArnoldErrorAction {
  if (!error) {
    return "none";
  }
  const code =
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  if (isArnoldRefusal(code, "proRequired")) {
    return "paywall";
  }
  if (code && endedSessionCodes.has(code)) {
    return "new-conversation";
  }
  return "show";
}

/**
 * eve keeps a refused send in the thread as a failed user message (its
 * metadata `status`). The screen gives that text back to the composer, so it
 * hides the placeholder rather than show a request that never went through.
 */
export function isRefusedSend(message: ThreadMessage): boolean {
  return message.role === "user" && message.metadata.custom.status === "failed";
}

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

function readJson<T>(key: string): T | undefined {
  const raw = storage.getString(key);
  if (!raw) {
    return;
  }
  let value: T | undefined;
  try {
    value = JSON.parse(raw) as T;
  } catch {
    // An unreadable value counts as nothing saved.
    value = undefined;
  }
  return value;
}

export function loadSavedArnoldConversation(
  userId: string
): SavedArnoldConversation {
  const session = readJson<ClientSessionState>(sessionKey(userId));
  if (!session) {
    return {};
  }
  const events = readJson<MessageStreamEvent[]>(eventsKey(userId));
  return events ? { events, session } : { session };
}

export function saveArnoldConversation(
  userId: string,
  { events, session }: SavedArnoldConversation
) {
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
}

/**
 * Records the session cursor as soon as eve reports it, so a screen reopened
 * mid-answer resumes it. Saved events stay while the session is the same one;
 * no session (a reset) forgets the Conversation.
 */
export function saveArnoldSession(
  userId: string,
  session: ClientSessionState | undefined
) {
  if (!session) {
    clearSavedArnoldConversation(userId);
    return;
  }
  const saved = readJson<ClientSessionState>(sessionKey(userId));
  if (saved?.sessionId !== session.sessionId) {
    storage.remove(eventsKey(userId));
  }
  storage.set(sessionKey(userId), JSON.stringify(session));
}

export function clearSavedArnoldConversation(userId: string) {
  storage.remove(sessionKey(userId));
  storage.remove(eventsKey(userId));
}
