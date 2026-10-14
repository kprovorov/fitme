import { verifyToken } from "@clerk/backend";
import { TokenVerificationError } from "@clerk/backend/errors";
import {
  type AuthFn,
  extractBearerToken,
  ForbiddenError,
  withAuthChallenges,
} from "eve/channels/auth";

export type ClaimSession = (
  sessionId: string,
  userId: string
) => Promise<string | null>;

interface ClerkSessionOptions {
  /**
   * Records `sessionId` for `userId` unless it is recorded already, then
   * returns the User it is recorded for (`null` if that can't be told).
   */
  claimSession: ClaimSession;
  /** The Clerk instance's PEM public key; defaults to `CLERK_JWT_KEY`. */
  jwtKey?: () => string | undefined;
}

// Every route that addresses one session: messages, stream, cancel, clear,
// compact, reset, stubs and subagent streams.
const SESSION_ROUTE = /\/eve\/v1\/session\/([^/]+)/;

/**
 * Route auth for the Coach channel: accepts a request only with a valid Clerk
 * session token, verified networkless against the Clerk JWT public key, and
 * makes its User id (`sub`) the session principal. A missing, expired or
 * forged token skips, so the walk answers 401. A missing key throws: the
 * channel never serves without auth.
 *
 * EVE's route auth has no session ownership, so every route addressing a
 * session claims it: the first caller to address an unrecorded session (its
 * creator: the id has only gone to them) is recorded as its owner, and any
 * other caller gets a 403. EVE gives the channel no session id at creation,
 * so this is the earliest point to record it. If the owner can't be
 * recorded, the route fails rather than let anyone in.
 *
 * The token itself never reaches the session: tools act through `asUser` with
 * the principal id, so a turn outliving the ~60 s token still works.
 */
export const clerkSession = ({
  jwtKey = () => process.env.CLERK_JWT_KEY,
  claimSession,
}: ClerkSessionOptions): AuthFn<Request> =>
  withAuthChallenges(
    async (request) => {
      const token = extractBearerToken(request.headers.get("authorization"));
      if (!token) {
        return null;
      }
      const key = jwtKey();
      if (!key) {
        throw new Error("Missing CLERK_JWT_KEY environment variable");
      }
      let userId: string;
      try {
        // Checks the signature, `exp`, `nbf` and `iat`, and requires a `sub`.
        ({ sub: userId } = await verifyToken(token, { jwtKey: key }));
      } catch (error) {
        if (error instanceof TokenVerificationError) {
          // A wrong CLERK_JWT_KEY fails every token with the same reasons as a
          // forged one, so log them: a burst of these points at the key.
          console.warn(`Rejected Clerk token: ${error.reason}`);
          return null;
        }
        throw error;
      }
      const sessionId = new URL(request.url).pathname.match(SESSION_ROUTE)?.[1];
      if (sessionId) {
        const owner = await claimSession(decodeURIComponent(sessionId), userId);
        if (owner !== userId) {
          throw new ForbiddenError({ message: "Not your Conversation." });
        }
      }
      return {
        attributes: {},
        authenticator: "clerk",
        principalId: userId,
        principalType: "user",
      };
    },
    [{ scheme: "Bearer" }]
  );
