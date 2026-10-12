"use client";

import { useSession } from "@clerk/nextjs";
import type { Database } from "@fitme/supabase";
import { createClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { supabaseAnonKey, supabaseUrl } from "~/lib/env";

/**
 * Supabase client for Client Components. Requests carry the User's Clerk
 * session token (refreshed by Clerk), so RLS sees their Clerk id as `sub`.
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
