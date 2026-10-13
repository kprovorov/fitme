import { getAuth } from "@clerk/hono";
import { protectedResourceHandlerClerk } from "@clerk/mcp-tools/hono";
import type { Context } from "hono";
import { env } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import { decodeJwt } from "jose";
import type { ClerkUser } from "./context.js";
import {
  type SupabaseTokenSigner,
  supabaseTokenSignerFromEnv,
} from "./supabase-token.js";

/**
 * MCP authorization (OAuth 2.1). This server is the protected resource; the
 * authorization server is Clerk. Every MCP request needs a Clerk OAuth access
 * token. Once Clerk has verified it, the server signs a short-lived Supabase
 * token for the User (ADR 0002), so RLS keeps enforcing ownership.
 */

/** RFC 9728 metadata for a resource served at the root path. */
export const PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource";

/** Without these the server refuses MCP requests rather than skip auth. */
const REQUIRED_ENV = [
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "SUPABASE_JWT_SIGNING_KEY",
] as const;

export interface AuthVariables {
  /** The bearer token of the request (set by `requireBearerToken`). */
  accessToken: string;
  /** The verified Clerk User (set by `requireClerkUser`). */
  clerkUser: ClerkUser;
  signToken: SupabaseTokenSigner;
}

/**
 * Canonical URI of this MCP server (the endpoint is the root path).
 * `MCP_PUBLIC_URL` overrides the request URL behind proxies.
 */
const resourceUrl = (c: Context) =>
  new URL("/", env<{ MCP_PUBLIC_URL?: string }>(c).MCP_PUBLIC_URL || c.req.url)
    .href;

const resourceMetadataUrl = (c: Context) =>
  new URL(PROTECTED_RESOURCE_METADATA_PATH, resourceUrl(c)).href;

/** Protected-resource metadata naming the Clerk instance as the issuer. */
export const protectedResourceMetadata = (c: Context) =>
  protectedResourceHandlerClerk({
    bearer_methods_supported: ["header"],
    resource: resourceUrl(c),
    resource_name: "Fitme",
  })(c);

/**
 * 401 with the `WWW-Authenticate` challenge MCP clients use to discover the
 * authorization server and start (or, for a rejected token, redo) OAuth.
 */
function unauthorized(c: Context, reason: "invalid" | "missing") {
  const metadata = `resource_metadata="${resourceMetadataUrl(c)}"`;
  if (reason === "missing") {
    // RFC 6750: a request without credentials gets no error code.
    c.header("WWW-Authenticate", `Bearer ${metadata}`);
    return c.json(
      { error_description: "Authentication required: sign in with OAuth." },
      401
    );
  }
  const description = "The access token is invalid or expired. Sign in again.";
  c.header(
    "WWW-Authenticate",
    `Bearer error="invalid_token", error_description="${description}", ${metadata}`
  );
  return c.json(
    { error: "invalid_token", error_description: description },
    401
  );
}

/** Fails closed (500) when the Clerk or signing config is missing. */
export const requireConfig = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const values = env<Record<string, string | undefined>>(c);
    const missing = REQUIRED_ENV.filter((name) => !values[name]);
    const signToken = supabaseTokenSignerFromEnv(
      values.SUPABASE_JWT_SIGNING_KEY
    );
    if (missing.length > 0 || !signToken) {
      return c.json(
        {
          error: {
            code: "not_configured",
            message: `This MCP server is not configured: ${missing.join(", ")} must be set.`,
          },
        },
        500
      );
    }
    c.set("signToken", signToken);
    await next();
  }
);

const BEARER_TOKEN = /^Bearer\s+(\S+)\s*$/i;

/** 401 without `Authorization: Bearer <token>`, before asking Clerk. */
export const requireBearerToken = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const token = c.req.header("Authorization")?.match(BEARER_TOKEN)?.[1];
  if (!token) {
    return unauthorized(c, "missing");
  }
  c.set("accessToken", token);
  await next();
});

/** The token's `exp`, when it is a JWT (Clerk's opaque tokens have none). */
function tokenExpiry(token: string): number | undefined {
  try {
    return decodeJwt(token).exp;
  } catch {
    // Not a JWT: Clerk verified an opaque token, whose expiry isn't readable.
    return undefined;
  }
}

/**
 * Admits only Clerk OAuth access tokens that `clerkMiddleware` verified.
 * The User id comes from Clerk, never from the request.
 */
export const requireClerkUser = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const auth = getAuth(c, { acceptsToken: "oauth_token" });
    if (!(auth.isAuthenticated && auth.userId)) {
      return unauthorized(c, "invalid");
    }
    c.set("clerkUser", {
      expiresAt: tokenExpiry(c.get("accessToken")),
      userId: auth.userId,
    });
    await next();
  }
);
