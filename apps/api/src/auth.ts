import { verifyToken } from "@clerk/backend";
import { TokenVerificationError } from "@clerk/backend/errors";
import type { z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import type { ErrorResponse } from "./schemas.js";
import type { ServicesFactory, UserServices } from "./services.js";

/**
 * Who a request comes from, verified (ADR 0011). Only Clerk session tokens so
 * far; `"oauth"` (with its client) and `"api_key"` join this union later.
 */
export interface Caller {
  kind: "session";
  /** The Clerk User id, from the verified token only. */
  userId: string;
}

/** What a route needs the caller to be allowed to do. */
export type Permission = "read" | "write";

export interface ApiEnv {
  Variables: {
    caller: Caller;
    /** The caller's services, built on first use (a 500 when unconfigured). */
    getServices: () => UserServices;
  };
}

/** The OpenAPI security scheme every User-data route declares. */
export const BEARER_AUTH = "bearerAuth";

/** The `security` of a User-data route: a Clerk session token as a bearer. */
export const bearerSecurity = [{ [BEARER_AUTH]: [] }];

const BEARER = /^Bearer (\S+)$/i;

const unauthorized = {
  error: {
    code: "unauthorized",
    message: "A valid Clerk session token is required",
  },
} satisfies z.infer<typeof ErrorResponse>;

/** The User id (`sub`) of a Clerk session token verified by `jwtKey`, or why it was rejected. */
const verifySessionToken = async (token: string, jwtKey: string) => {
  try {
    // Networkless: checks the signature, `exp`, `nbf` and `iat`, and requires a `sub`.
    const { sid, sub } = await verifyToken(token, { jwtKey });
    // Only a session token carries its session (`sid`): a JWT template's
    // token doesn't, and stays valid after the session ends.
    if (typeof sid !== "string") {
      return "no-session";
    }
    return { userId: sub };
  } catch (error) {
    if (error instanceof TokenVerificationError) {
      return error.reason;
    }
    throw error;
  }
};

/**
 * Requires `Authorization: Bearer <Clerk session token>`, verified without a
 * network call against the instance's public key, and sets the verified
 * `caller` and `getServices`. A missing key throws first (a reported 500,
 * token or not), so the API never serves without auth; a missing, malformed
 * or unverifiable token answers 401.
 */
export const requireCaller = ({
  clerkJwtKey,
  createServices,
}: {
  clerkJwtKey: string | undefined;
  createServices: ServicesFactory;
}) =>
  createMiddleware<ApiEnv>(async (c, next) => {
    if (!clerkJwtKey) {
      throw new Error("Missing CLERK_JWT_KEY environment variable");
    }
    const token = c.req.header("authorization")?.match(BEARER)?.[1];
    if (!token) {
      return c.json(unauthorized, 401);
    }
    const result = await verifySessionToken(token, clerkJwtKey);
    if (typeof result === "string") {
      // A wrong CLERK_JWT_KEY fails every token the same way a forged one
      // does, so log why: a burst of these points at the key.
      console.warn(`Rejected Clerk token: ${result}`);
      return c.json(unauthorized, 401);
    }
    const caller: Caller = { kind: "session", userId: result.userId };
    c.set("caller", caller);
    let services: UserServices | undefined;
    c.set("getServices", () => {
      services ??= createServices(caller.userId) ?? undefined;
      if (!services) {
        throw new Error("Missing FITME_DATABASE_URL environment variable");
      }
      return services;
    });
    await next();
  });

/**
 * What each kind of caller may do. A session token is the User themselves,
 * so it may do everything; scoped credentials (OAuth, API keys) come later.
 */
const allows = (caller: Caller, _permission: Permission) =>
  caller.kind === "session";

/**
 * A route's own middleware, declaring the permission it needs. No caller can
 * lack one yet, so a refusal fails closed (a reported 500) until scoped
 * credentials bring a documented answer for it.
 */
export const requires = (permission: Permission) =>
  createMiddleware<ApiEnv>(async (c, next) => {
    if (!allows(c.get("caller"), permission)) {
      throw new Error(`Caller lacks the ${permission} permission`);
    }
    await next();
  });
