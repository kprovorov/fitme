import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import {
  createSupabaseClientFromEnv,
  type FitmeSupabaseClient,
  type SupabaseClientFactory,
} from "./supabase.js";
import { ToolError } from "./tools/helpers.js";

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

const AUTH_REQUIRED_MESSAGE =
  "Authentication required: this tool reads or changes your Fitme data. Connect with an `Authorization: Bearer <Supabase access token>` header.";

const NOT_CONFIGURED_MESSAGE =
  "This MCP server is not configured for user data (SUPABASE_URL / SUPABASE_ANON_KEY are missing).";

async function resolveUserContext(
  accessToken: string | null | undefined,
  createSupabaseClient: SupabaseClientFactory
): Promise<UserContext> {
  if (!accessToken) {
    throw new ToolError(AUTH_REQUIRED_MESSAGE);
  }

  const supabase = createSupabaseClient(accessToken);
  if (!supabase) {
    throw new ToolError(NOT_CONFIGURED_MESSAGE);
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (isAuthRetryableFetchError(error)) {
    throw new ToolError(
      `Could not reach Supabase to verify the access token: ${error.message}. Try again later.`
    );
  }
  if (error || !data.user) {
    const reason = error?.message ?? "no user for this token";
    throw new ToolError(
      `Authentication failed: ${reason}. The bearer token must be a valid, unexpired Supabase access token for a Fitme user.`
    );
  }

  return { supabase, userId: data.user.id };
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
