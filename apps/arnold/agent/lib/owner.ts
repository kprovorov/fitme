import type { SessionContext } from "eve/tools";

type SessionAuth = SessionContext["session"]["auth"];
type Caller = SessionAuth["current"];

const clerkUserId = (caller: Caller): string | null =>
  caller?.authenticator === "clerk" && caller.principalType === "user"
    ? caller.principalId
    : null;

/**
 * The Clerk User who owns the Conversation: the verified caller who started
 * the session. The only User id tools act as; it never comes from tool input.
 */
export const conversationOwner = (auth: SessionAuth): string | null =>
  clerkUserId(auth.initiator);

/**
 * The Conversation owner when they are the turn's caller, else `null`. Route
 * auth only proves who the caller is; anyone holding a session id could
 * otherwise post to it.
 */
export const ownerOfTurn = (auth: SessionAuth): string | null => {
  const owner = conversationOwner(auth);
  return owner !== null && clerkUserId(auth.current) === owner ? owner : null;
};

/** The Conversation owner's User id; throws when the session has none. */
export const requireConversationOwner = (auth: SessionAuth): string => {
  const owner = conversationOwner(auth);
  if (!owner) {
    throw new Error("This Conversation has no signed-in owner");
  }
  return owner;
};
