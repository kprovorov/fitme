import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import {
  createSupabaseClientFromEnv,
  type FitmeSupabaseClient,
  type SupabaseClientFactory,
} from "./supabase.js";
import { ToolError, toErrorMessage } from "./tools/helpers.js";

export interface UserContext {
  supabase: FitmeSupabaseClient;
  userId: string;
}

export interface ToolContext {
  /**
   * Resolves the authenticated caller. The token is verified once per request
   * (lazily, on the first user tool call) and the result is cached.
   */
  getUserContext: () => Promise<UserContext>;
}

export interface ToolContextOptions {
  accessToken?: string | null;
  createSupabaseClient?: SupabaseClientFactory;
}

/**
 * The caller has no usable credentials: no token (`missing`), or one Supabase
 * rejected (`invalid`). Over HTTP this becomes a 401 that starts the OAuth
 * flow; other failures (server not configured, Supabase unreachable) stay
 * tool errors because signing in again would not fix them.
 */
export class AuthenticationError extends ToolError {
  readonly reason: "invalid" | "missing";

  constructor(reason: "invalid" | "missing", message: string) {
    super(message);
    this.name = "AuthenticationError";
    this.reason = reason;
  }
}

const AUTH_REQUIRED_MESSAGE =
  "Authentication required: this tool reads or changes your Fitme data. Sign in to the Fitme MCP server (OAuth) or connect with an `Authorization: Bearer <Supabase access token>` header.";

const NOT_CONFIGURED_MESSAGE =
  "This MCP server is not configured for user data (SUPABASE_URL / SUPABASE_ANON_KEY are missing).";

const invalidToken = (reason: string) =>
  new AuthenticationError(
    "invalid",
    `Authentication failed: ${reason}. The bearer token must be a valid, unexpired Supabase access token for a Fitme user.`
  );

/**
 * Verifies the access token and returns its user id. `getClaims` checks the
 * signature locally against the project's cached JWKS when it uses asymmetric
 * signing keys, and falls back to an `auth.getUser` round-trip otherwise.
 */
async function verifyAccessToken(
  supabase: FitmeSupabaseClient,
  accessToken: string
): Promise<string> {
  let result: Awaited<ReturnType<FitmeSupabaseClient["auth"]["getClaims"]>>;
  try {
    result = await supabase.auth.getClaims(accessToken);
  } catch (thrown) {
    // Expiry and malformed payloads are thrown as plain errors.
    throw invalidToken(toErrorMessage(thrown));
  }

  const { data, error } = result;
  if (isAuthRetryableFetchError(error)) {
    throw new ToolError(
      `Could not reach Supabase to verify the access token: ${error.message}. Try again later.`
    );
  }
  if (error || !data) {
    throw invalidToken(error?.message ?? "the token could not be verified");
  }
  // The anon and service-role keys are valid JWTs too, but carry no user.
  const userId = data.claims.sub;
  if (!userId) {
    throw invalidToken("the token does not belong to a user");
  }
  return userId;
}

async function resolveUserContext(
  accessToken: string | null | undefined,
  createSupabaseClient: SupabaseClientFactory
): Promise<UserContext> {
  if (!accessToken) {
    throw new AuthenticationError("missing", AUTH_REQUIRED_MESSAGE);
  }

  const supabase = createSupabaseClient(accessToken);
  if (!supabase) {
    throw new ToolError(NOT_CONFIGURED_MESSAGE);
  }

  const userId = await verifyAccessToken(supabase, accessToken);
  return { supabase, userId };
}

export function createToolContext({
  accessToken,
  createSupabaseClient = createSupabaseClientFromEnv,
}: ToolContextOptions = {}): ToolContext {
  let userContext: Promise<UserContext> | undefined;

  return {
    getUserContext: () => {
      userContext ??= resolveUserContext(accessToken, createSupabaseClient);
      return userContext;
    },
  };
}
