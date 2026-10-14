import { verifyToken } from "@clerk/backend";
import { TokenVerificationError } from "@clerk/backend/errors";
import {
  type AuthFn,
  extractBearerToken,
  withAuthChallenges,
} from "eve/channels/auth";

interface ClerkSessionOptions {
  /** The Clerk instance's PEM public key; defaults to `CLERK_JWT_KEY`. */
  jwtKey?: () => string | undefined;
}

/**
 * Route auth for the Coach channel: accepts a request only with a valid Clerk
 * session token, verified networkless against the Clerk JWT public key, and
 * makes its User id (`sub`) the session principal. A missing, expired or
 * forged token skips, so the walk answers 401. A missing key throws: the
 * channel never serves without auth.
 *
 * The token itself never reaches the session: tools act through `asUser` with
 * the principal id, so a turn outliving the ~60 s token still works.
 */
export const clerkSession = ({
  jwtKey = () => process.env.CLERK_JWT_KEY,
}: ClerkSessionOptions = {}): AuthFn<Request> =>
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
      try {
        // Checks the signature, `exp`, `nbf` and `iat`, and requires a `sub`.
        const { sub } = await verifyToken(token, { jwtKey: key });
        return {
          attributes: {},
          authenticator: "clerk",
          principalId: sub,
          principalType: "user",
        };
      } catch (error) {
        if (error instanceof TokenVerificationError) {
          // A wrong CLERK_JWT_KEY fails every token with the same reasons as a
          // forged one, so log them: a burst of these points at the key.
          console.warn(`Rejected Clerk token: ${error.reason}`);
          return null;
        }
        throw error;
      }
    },
    [{ scheme: "Bearer" }]
  );
