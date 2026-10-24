import { clerkMiddleware, getAuth } from "@clerk/hono";
import { protectedResourceHandlerClerk } from "@clerk/mcp-tools/hono";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Context } from "hono";
import { env } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import type { ClerkUser } from "./context.js";

/**
 * MCP authorization (OAuth 2.1). This server is the protected resource; the
 * authorization server is Clerk. Every MCP request needs a Clerk OAuth access
 * token. Once Clerk has verified it, tools run as the User through `asUser`
 * (ADR 0003), so RLS keeps enforcing ownership.
 */

/** RFC 9728 metadata for a resource served at the root path. */
export const PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource";

/** Without these the server refuses MCP requests rather than skip auth. */
const REQUIRED_ENV = [
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "FITME_DATABASE_URL",
] as const;

export interface AuthVariables {
  /** The verified Clerk User (set by `requireClerkUser`). */
  clerkUser: ClerkUser;
  /**
   * The verified token as the MCP SDK's `AuthInfo` (set by `requireClerkUser`),
   * which `streamableHttpHandler` hands to tool handlers as `extra.authInfo`.
   */
  mcpAuth: AuthInfo;
}

/**
 * Canonical URI of this MCP server (the endpoint is the root path).
 * `MCP_PUBLIC_URL` overrides the request URL behind proxies.
 */
const resourceUrl = (c: Context) =>
  new URL("/", env<{ MCP_PUBLIC_URL?: string }>(c).MCP_PUBLIC_URL || c.req.url)
    .href;

/**
 * The audiences a token for this server may carry (RFC 8707 `resource`, which
 * Clerk stamps into `aud`): the canonical URI, and the same URI without its
 * trailing slash, since Clerk compares them as exact strings.
 */
const audiences = (c: Context) => {
  const resource = resourceUrl(c);
  return [resource, resource.slice(0, -1)];
};

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

/** Fails closed (500) when the Clerk or database config is missing. */
export const requireConfig = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const values = env<Record<string, string | undefined>>(c);
    const missing = REQUIRED_ENV.filter((name) => !values[name]);
    if (missing.length > 0) {
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
    await next();
  }
);

const BEARER_TOKEN = /^Bearer\s+(\S+)\s*$/i;

const bearerToken = (c: Context) =>
  c.req.header("Authorization")?.match(BEARER_TOKEN)?.[1];

/** 401 without `Authorization: Bearer <token>`, before asking Clerk. */
export const requireBearerToken = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  if (!bearerToken(c)) {
    return unauthorized(c, "missing");
  }
  await next();
});

/**
 * Clerk verifies the token, and only one issued for this server: a token
 * without our `aud` (another resource's, or one from before Clerk added the
 * claim) is rejected, so `requireClerkUser` answers 401 `invalid_token` and
 * the client signs in again (MCP authorization: token audience validation).
 */
export const verifyClerkToken = createMiddleware<{
  Variables: AuthVariables;
}>((c, next) => clerkMiddleware({ audience: audiences(c) })(c, next));

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
    c.set("clerkUser", { userId: auth.userId });
    c.set("mcpAuth", {
      clientId: auth.clientId,
      extra: { userId: auth.userId },
      resource: new URL(resourceUrl(c)),
      scopes: auth.scopes,
      token: bearerToken(c) ?? "",
    });
    await next();
  }
);
