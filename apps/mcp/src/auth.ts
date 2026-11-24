import { getAuth } from "@clerk/hono";
import { generateProtectedResourceMetadata } from "@clerk/mcp-tools/hono";
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

/**
 * Protected-resource metadata naming the Clerk instance as the issuer. The
 * properties derived from the issuer are the ones `@clerk/mcp-tools` generated
 * before 1.0, kept so the document clients discover stays the same.
 */
export const protectedResourceMetadata = (c: Context) => {
  const publishableKey = env<{ CLERK_PUBLISHABLE_KEY?: string }>(
    c
  ).CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    throw new Error("CLERK_PUBLISHABLE_KEY must be set");
  }

  const resource = { publishableKey, resourceUrl: resourceUrl(c) };

  const {
    authorization_servers: [issuer],
  } = generateProtectedResourceMetadata(resource);

  return c.json(
    generateProtectedResourceMetadata({
      ...resource,
      properties: {
        authorization_data_locations_supported: ["header", "body"],
        authorization_data_types_supported: ["oauth_scope"],
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        key_challenges_supported: [
          {
            challenge_algs: ["S256"],
            challenge_type: "urn:ietf:params:oauth:pkce:code_challenge",
          },
        ],
        resource_name: "Fitme",
        service_documentation: "https://clerk.com/docs",
        token_introspection_endpoint: `${issuer}/oauth/token`,
        token_introspection_endpoint_auth_methods_supported: [
          "client_secret_post",
          "client_secret_basic",
        ],
        token_types_supported: [
          "urn:ietf:params:oauth:token-type:access_token",
        ],
      },
    })
  );
};

/**
 * 401 with the `WWW-Authenticate` challenge MCP clients use to discover the
 * authorization server and start (or, for a rejected token, redo) OAuth.
 */
const unauthorized = (c: Context, reason: "invalid" | "missing") => {
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
};

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

const BEARER_TOKEN = /^Bearer\s+\S+\s*$/iu;

/** 401 without `Authorization: Bearer <token>`, before asking Clerk. */
export const requireBearerToken = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  if (!BEARER_TOKEN.test(c.req.header("Authorization") ?? "")) {
    return unauthorized(c, "missing");
  }

  await next();
});

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

    await next();
  }
);
