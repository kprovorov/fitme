import {
  createServicesFromEnv,
  type ServicesFactory,
  type UserServices,
} from "./services.js";
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
   * The caller's services, each run through `asUser` as the verified User.
   * Built once per request, on the first tool that needs them. Throws a
   * `ToolError` when the database isn't configured.
   */
  getServices: () => UserServices;
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
  createServices?: ServicesFactory;
  createSupabaseClient?: SupabaseClientFactory;
  signToken: SupabaseTokenSigner;
  /** Must come from a verified Clerk token, never from request data. */
  user: ClerkUser;
}

const DATABASE_NOT_CONFIGURED_MESSAGE =
  "This MCP server is not configured for user data (FITME_DATABASE_URL is missing).";

const NOT_CONFIGURED_MESSAGE =
  "This MCP server is not configured for user data (SUPABASE_URL / SUPABASE_ANON_KEY are missing).";

/**
 * Tool context for a verified Clerk User: their tools run on services bound to
 * that User id through `asUser`, or (tools not moved yet) on a Supabase client
 * carrying a short-lived token signed for that User id, capped at the Clerk
 * token's expiry, so RLS and the RPCs see them as the caller.
 */
export function createToolContext({
  createServices = createServicesFromEnv,
  createSupabaseClient = createSupabaseClientFromEnv,
  signToken,
  user,
}: ToolContextOptions): ToolContext {
  let services: UserServices | undefined;
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
    getServices: () => {
      services ??= createServices(user.userId) ?? undefined;
      if (!services) {
        throw new ToolError(DATABASE_NOT_CONFIGURED_MESSAGE);
      }
      return services;
    },
    getUserContext: () => {
      userContext ??= resolve();
      return userContext;
    },
  };
}
