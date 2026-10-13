import {
  createSupabaseClientFromEnv,
  type FitmeSupabaseClient,
  type SupabaseClientFactory,
} from "./supabase.js";
import type { SupabaseTokenSigner } from "./supabase-token.js";
import { ToolError } from "./tools/helpers.js";

export interface UserContext {
  supabase: FitmeSupabaseClient;
  userId: string;
}

export interface ToolContext {
  /**
   * The caller's Supabase client and User id. Resolved once per request
   * (lazily, on the first user tool call) and cached.
   */
  getUserContext: () => Promise<UserContext>;
}

/** The User a verified Clerk OAuth token belongs to. */
export interface ClerkUser {
  /** The Clerk token's `exp` (epoch seconds), when it is a JWT. */
  expiresAt?: number;
  userId: string;
}

export interface ToolContextOptions {
  createSupabaseClient?: SupabaseClientFactory;
  signToken: SupabaseTokenSigner;
  /** Must come from a verified Clerk token, never from request data. */
  user: ClerkUser;
}

const NOT_CONFIGURED_MESSAGE =
  "This MCP server is not configured for user data (SUPABASE_URL / SUPABASE_ANON_KEY are missing).";

/**
 * Tool context for a verified Clerk User: their tools run on a Supabase
 * client carrying a short-lived token signed for that User id, capped at the
 * Clerk token's expiry, so RLS and the RPCs see them as the caller.
 */
export function createToolContext({
  createSupabaseClient = createSupabaseClientFromEnv,
  signToken,
  user,
}: ToolContextOptions): ToolContext {
  let userContext: Promise<UserContext> | undefined;

  const resolve = async (): Promise<UserContext> => {
    const token = await signToken(user.userId, {
      expiresAtMost: user.expiresAt,
    });
    const supabase = createSupabaseClient(token);
    if (supabase === null) {
      throw new ToolError(NOT_CONFIGURED_MESSAGE);
    }
    return { supabase, userId: user.userId };
  };

  return {
    getUserContext: () => {
      userContext ??= resolve();
      return userContext;
    },
  };
}
