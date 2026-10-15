import { type CoachModelId, coachErrorCodes } from "@fitme/core";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { storage } from "~/lib/mmkv";

/** The Coach (`apps/coach`) base URL; its eve routes live under `/eve/v1`. */
export const COACH_URL = process.env.EXPO_PUBLIC_COACH_URL ?? "";

/**
 * The run config a Coach turn is sent with. eve forwards `custom` as the
 * turn's client context, where the Coach reads the model to answer with.
 */
export function coachRunConfig(model: CoachModelId) {
  return { custom: { model } };
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

/** The User's current Conversation, enough for eve to resume it. */
export interface SavedCoachConversation {
  /** An ordered prefix of the session's stream, to render before resuming. */
  events?: readonly MessageStreamEvent[];
  session?: ClientSessionState;
}

const storageKey = (userId: string) => `coach.conversation.${userId}`;

export function loadSavedCoachConversation(
  userId: string
): SavedCoachConversation {
  const raw = storage.getString(storageKey(userId));
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as SavedCoachConversation;
  } catch {
    return {};
  }
}

export function saveCoachConversation(
  userId: string,
  conversation: SavedCoachConversation
) {
  storage.set(storageKey(userId), JSON.stringify(conversation));
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
  const saved = loadSavedCoachConversation(userId);
  const events =
    saved.session?.sessionId === session.sessionId ? saved.events : undefined;
  saveCoachConversation(userId, events ? { events, session } : { session });
}

export function clearSavedCoachConversation(userId: string) {
  storage.delete(storageKey(userId));
}
