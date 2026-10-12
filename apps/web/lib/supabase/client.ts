"use client";

import { useSession } from "@clerk/nextjs";
import type { Database } from "@fitme/supabase";
import { createClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { supabaseAnonKey, supabaseUrl } from "~/lib/env";

/**
 * Supabase client for Client Components. Requests carry the User's Clerk
 * session token (refreshed by Clerk), so RLS sees their Clerk id as `sub`.
 * Until Clerk has loaded the session, requests go out as anon: gate queries on
 * `useAuth().isSignedIn` and key them by the User id so anon results aren't cached.
 */
export function useSupabase() {
  const { session } = useSession();

  return useMemo(
    () =>
      createClient<Database>(supabaseUrl, supabaseAnonKey, {
        accessToken: async () => (await session?.getToken()) ?? null,
      }),
    [session]
  );
}
