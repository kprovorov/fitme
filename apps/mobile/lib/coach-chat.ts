import type { ThreadMessage } from "@assistant-ui/react-native";
import { coachErrorCodes } from "@fitme/core";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { storage } from "~/lib/mmkv";

/** The Coach (`apps/arnold`) base URL; its eve routes live under `/eve/v1`. */
export const COACH_URL = process.env.EXPO_PUBLIC_COACH_URL ?? "";

/**
 * The run config a Coach turn is sent with. eve forwards `custom` as the
 * turn's client context, where the Coach reads the model to answer with.
 * Without a model (no model list on the device) nothing is sent, so the Coach
 * picks its own default.
 */
export function coachRunConfig(model: string | undefined) {
  return model ? { custom: { model } } : {};
}

/**
 * eve codes for a session that can't take turns anymore: reset (account
 * deletion), past the Coach's 30-day timeout, or built by another eve version.
 */
const endedSessionCodes: ReadonlySet<string> = new Set([
  "session_expired",
  "session_not_active",
  "session_stranded",
]);

export type CoachErrorAction = "new-conversation" | "none" | "paywall" | "show";

/**
 * What the coach screen does with a Coach error: the channel's not-Pro refusal
 * shows the paywall, an ended session starts a new Conversation, and anything
 * else shows the error state. Duck-typed on eve's `ClientError` (`code` from
 * the JSON body) so the app doesn't bundle `eve/client` for an `instanceof`.
 */
export function coachErrorAction(error: unknown): CoachErrorAction {
  if (!error) {
    return "none";
  }
  const code =
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  if (code === coachErrorCodes.proRequired) {
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
export interface SavedCoachConversation {
  /** An ordered prefix of the session's stream, to render before resuming. */
  events?: readonly MessageStreamEvent[];
  session?: ClientSessionState;
}

// Two keys, so the cursor (saved on every streamed event) never rewrites the
// event log (saved once per finished turn).
const sessionKey = (userId: string) => `coach.conversation.${userId}.session`;
const eventsKey = (userId: string) => `coach.conversation.${userId}.events`;

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

export function loadSavedCoachConversation(
  userId: string
): SavedCoachConversation {
  const session = readJson<ClientSessionState>(sessionKey(userId));
  if (!session) {
    return {};
  }
  const events = readJson<MessageStreamEvent[]>(eventsKey(userId));
  return events ? { events, session } : { session };
}

export function saveCoachConversation(
  userId: string,
  { events, session }: SavedCoachConversation
) {
  if (!session) {
    clearSavedCoachConversation(userId);
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
export function saveCoachSession(
  userId: string,
  session: ClientSessionState | undefined
) {
  if (!session) {
    clearSavedCoachConversation(userId);
    return;
  }
  const saved = readJson<ClientSessionState>(sessionKey(userId));
  if (saved?.sessionId !== session.sessionId) {
    storage.remove(eventsKey(userId));
  }
  storage.set(sessionKey(userId), JSON.stringify(session));
}

export function clearSavedCoachConversation(userId: string) {
  storage.remove(sessionKey(userId));
  storage.remove(eventsKey(userId));
}
