import type { Profile } from "@fitme/core";
import { createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";

/** The current User's Profile, or `null` until they fill one in. */
export const useProfileQuery = createQuery<Profile | null>({
  fetcher: async (): Promise<Profile | null> => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }
    if (!session) {
      throw new Error("Not authenticated");
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return profile;
  },
  queryKey: ["profile"],
  retry: false,
});
