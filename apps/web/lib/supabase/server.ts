import { auth } from "@clerk/nextjs/server";
import type { Database } from "@fitme/supabase";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "~/lib/env";

/**
 * Supabase client for Server Components and Server Actions. Requests carry the
 * User's Clerk session token, so RLS sees their Clerk id as `sub`.
 */
export async function createClient() {
  // Read auth here, not inside `accessToken`: supabase-js turns errors thrown
  // there into query errors, which would swallow Next's dynamic-rendering bailout.
  const { getToken } = await auth();

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    accessToken: () => getToken(),
  });
}
