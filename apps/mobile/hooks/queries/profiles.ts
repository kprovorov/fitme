import type { Profile } from "@fitme/core";
import { createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "~/lib/clerk";

/** The current User's Profile, or `null` until they fill one in. */
export const useProfileQuery = createQuery<Profile | null>({
  fetcher: async (): Promise<Profile | null> => {
    const userId = getCurrentUserId();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
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
