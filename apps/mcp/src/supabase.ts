import type { Database } from "@fitme/supabase";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type FitmeSupabaseClient = SupabaseClient<Database>;

const TRAILING_SLASHES = /\/+$/;

/**
 * Builds a Supabase client that acts as the user who owns `accessToken`, or
 * returns `null` when the server isn't configured for user data.
 */
export type SupabaseClientFactory = (
  accessToken: string
) => FitmeSupabaseClient | null;

/**
 * Per-request client authenticated with the caller's access token. Only the
 * anon key is used, so RLS and the RPCs (keyed by the JWT `sub` claim) enforce
 * ownership.
 */
export const createSupabaseClientFromEnv: SupabaseClientFactory = (
  accessToken
) => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!(url && anonKey)) {
    return null;
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
};

/**
 * Issuer of the OAuth 2.1 authorization server (Supabase Auth's OAuth server)
 * that signs users in for the user tools, or `null` when the server isn't
 * configured for user data.
 */
export function authorizationServerFromEnv(): string | null {
  const url = process.env.SUPABASE_URL;
  if (!(url && process.env.SUPABASE_ANON_KEY)) {
    return null;
  }
  return `${url.replace(TRAILING_SLASHES, "")}/auth/v1`;
}
