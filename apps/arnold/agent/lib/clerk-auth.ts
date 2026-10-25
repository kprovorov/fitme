import { verifyToken } from "@clerk/backend";
import { TokenVerificationError } from "@clerk/backend/errors";
import { legacyArnoldErrorCodes } from "@fitme/core";
import {
  type AuthFn,
  extractBearerToken,
  ForbiddenError,
  withAuthChallenges,
} from "eve/channels/auth";
import type { ProCheck } from "./pro-access";

export type ClaimSession = (
  sessionId: string,
  userId: string
) => Promise<string | null>;

/**
 * Rejects a route with a 503 shaped like eve's auth failures (`no-store`,
 * `{ ok: false, code, error }`). `routeAuth` answers with the `response` of
 * anything thrown that carries one, like eve's own 401 and 403 errors (whose
 * types only take those two statuses).
 */
class ProCheckUnavailableError extends Error {
  override readonly name = "ProCheckUnavailableError";
  readonly response = Response.json(
    {
      code: legacyArnoldErrorCodes.proCheckUnavailable,
      error: "Arnold can't check your subscription right now. Try again soon.",
      ok: false,
    },
    { headers: { "cache-control": "no-store" }, status: 503 }
  );
}

interface ClerkSessionOptions {
  /** Whether the User has Pro; throws when that can't be told. */
  checkPro: ProCheck;
  /**
   * Records `sessionId` for `userId` unless it is recorded already, then
   * returns the User it is recorded for (`null` if that can't be told).
   */
  claimSession: ClaimSession;
  /** The Clerk instance's PEM public key; defaults to `CLERK_JWT_KEY`. */
  jwtKey?: () => string | undefined;
  /** Reports a failed Pro check, tagged with the User and route. */
  report: (
    error: unknown,
    tags: { path: string; userId: string }
  ) => Promise<void>;
}

// Every route that addresses one session: messages, stream, cancel, clear,
// compact, reset, stubs and subagent streams.
const SESSION_ROUTE = /\/eve\/v1\/session\/([^/]+)/;

/**
 * Route auth for Arnold's channel: accepts a request only with a valid Clerk
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
 * Only Pro Users may use Arnold: every route checks the verified User's
 * entitlement (cached by `checkPro`) before anything else runs, so a free
 * User can't start, continue or compact a Conversation. Without Pro the
 * answer is a 403 `coach_pro_required` (the app's paywall); when it can't be
 * told, a reported 503 `coach_pro_check_unavailable`: never let through.
 * Both are the `coach_*` codes (`legacyArnoldErrorCodes`): installed builds
 * from before the rename know only those, so they stay until the minimum
 * version gate cuts those builds off.
 *
 * The token itself never reaches the session: tools act through `asUser` with
 * the principal id, so a turn outliving the ~60 s token still works.
 */
export const clerkSession = ({
  checkPro,
  claimSession,
  jwtKey = () => process.env.CLERK_JWT_KEY,
  report,
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
      let isPro: boolean;
      try {
        isPro = await checkPro(userId);
      } catch (error) {
        await report(error, { path: new URL(request.url).pathname, userId });
        throw new ProCheckUnavailableError("Pro check unavailable", {
          cause: error,
        });
      }
      if (!isPro) {
        throw new ForbiddenError({
          code: legacyArnoldErrorCodes.proRequired,
          message: "Arnold is a Fitme Pro feature.",
        });
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
