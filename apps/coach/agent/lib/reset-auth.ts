import { createHash, timingSafeEqual } from "node:crypto";
import {
  type AuthFn,
  extractBearerToken,
  ForbiddenError,
  withAuthChallenges,
} from "eve/channels/auth";

interface AccountDeletionResetOptions {
  /** The shared secret apps/webhooks sends; defaults to `COACH_RESET_SECRET`. */
  secret?: () => string | undefined;
}

// Anything shorter isn't a generated secret (`openssl rand -hex 32` is 64).
const MIN_SECRET_LENGTH = 32;

const RESET_ROUTE = /^\/eve\/v1\/session\/[^/]+\/reset$/;

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Route auth for account deletion: apps/webhooks resets a deleted User's
 * Coach sessions with `Authorization: Bearer <COACH_RESET_SECRET>`. The
 * secret only ever resets: on any other route it answers 403, so it can't
 * read, continue or start a Conversation. Any other bearer skips, so the walk
 * moves on to the Clerk session check. Unset (or too short), it accepts
 * nothing.
 */
export const accountDeletionReset = ({
  secret = () => process.env.COACH_RESET_SECRET,
}: AccountDeletionResetOptions = {}): AuthFn<Request> =>
  withAuthChallenges(
    (request) => {
      const expected = secret();
      const token = extractBearerToken(request.headers.get("authorization"));
      if (!(expected && expected.length >= MIN_SECRET_LENGTH && token)) {
        return Promise.resolve(null);
      }
      // Compared as digests: equal length, constant time
      if (!timingSafeEqual(digest(token), digest(expected))) {
        return Promise.resolve(null);
      }
      const { pathname } = new URL(request.url);
      if (request.method !== "POST" || !RESET_ROUTE.test(pathname)) {
        throw new ForbiddenError({
          message: "This credential only resets sessions.",
        });
      }
      return Promise.resolve({
        attributes: {},
        authenticator: "account-deletion",
        principalId: "account-deletion",
        principalType: "service",
      });
    },
    [{ scheme: "Bearer" }]
  );
