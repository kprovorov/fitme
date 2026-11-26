import { verifyToken } from "@clerk/backend";
import { TokenVerificationError } from "@clerk/backend/errors";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

import type { ErrorResponse } from "./schemas";

/** Who a request comes from: a User, by their Clerk User id. */
export interface Caller {
  userId: string;
}

export interface AuthConfig {
  /** Each Clerk instance's PEM public key: a token verified by either is a User's. */
  clerkJwtKeys: { development?: string; production?: string };
}

export interface AuthEnv {
  Variables: { caller: Caller };
}

/** The OpenAPI security scheme every content route declares. */
export const BEARER_AUTH = "bearerAuth";

const BEARER = /^Bearer (?<token>\S+)$/iu;

const unauthorized = {
  error: {
    code: "unauthorized",
    message: "A Clerk session token is required",
  },
} satisfies z.infer<typeof ErrorResponse>;

/** The User id (`sub`) of a Clerk session token verified by `jwtKey`, or why it was rejected. */
const verifyClerkToken = async (token: string, jwtKey: string) => {
  try {
    // Networkless: checks the signature, `exp`, `nbf` and `iat`, and requires a `sub`.
    const { sid, sub } = await verifyToken(token, { jwtKey });

    // Only a session token carries its session (`sid`): a JWT template's
    // token doesn't, and stays valid after the session ends.
    if (!z.string().safeParse(sid).success) {
      return { success: false as const, reason: "no-session" };
    }

    return { success: true as const, userId: sub };
  } catch (error) {
    if (error instanceof TokenVerificationError) {
      return { success: false as const, reason: error.reason };
    }

    throw error;
  }
};

/**
 * Requires `Authorization: Bearer <token>` holding a Clerk session token from
 * either Clerk instance: every caller is a User. Sets the resolved `caller`
 * for later middleware; anything missing, malformed or unverifiable answers
 * 401.
 */
export const requireCaller = ({ clerkJwtKeys }: AuthConfig) => {
  const jwtKeys = [clerkJwtKeys.production, clerkJwtKeys.development].filter(
    (key): key is string => Boolean(key)
  );

  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = c.req.header("authorization")?.match(BEARER)?.groups?.token;

    if (token) {
      const results = await Promise.all(
        jwtKeys.map((jwtKey) => verifyClerkToken(token, jwtKey))
      );

      const verified = results.find((result) => result.success);

      if (verified) {
        c.set("caller", { userId: verified.userId });

        await next();

        return;
      }

      // A wrong Clerk key fails every token the same way a forged one does,
      // so log why: a burst of these points at the keys.
      const reasons = results.map((result) => result.reason).join(", ");
      console.warn(`Rejected bearer token: ${reasons || "no Clerk key"}`);
    }

    return c.json(unauthorized, 401);
  });
};
