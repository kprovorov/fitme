import type { Database } from "@fitme/supabase";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type FitmeSupabaseClient = SupabaseClient<Database>;

/**
 * Builds a Supabase client that acts as the User `accessToken` was signed for, or
 * returns `null` when the server isn't configured for user data.
 */
export type SupabaseClientFactory = (
  accessToken: string
) => FitmeSupabaseClient | null;

/**
 * Per-request client authenticated with the Supabase token the server signed
 * for the caller (ADR 0002). Only the
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
