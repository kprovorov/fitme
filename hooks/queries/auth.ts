import { supabase } from "@/lib/supabase";
import { User } from "@/lib/models";
import Purchases from "react-native-purchases";
import * as Sentry from "@sentry/react-native";
import { createQuery } from "react-query-kit";

export const useCurrentUserQuery = createQuery<User>({
  queryKey: ["user"],
  fetcher: async (): Promise<User> => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;
    if (!session) throw new Error("Not authenticated");

    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError) throw profileError;

    const user: User = {
      id: session.user.id,
      email: session.user.email!,
      name: (authUser?.user_metadata?.name as string) ?? "",
      profile: profile ?? undefined,
    };

    Sentry.setUser({
      id: user.id,
      username: user.email,
      email: user.email,
    });

    if (profile?.rc_user_id) {
      await Purchases.logIn(profile.rc_user_id);
    }

    return user;
  },
  retry: false,
});
