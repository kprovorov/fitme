import * as Sentry from "@sentry/react-native";
import Purchases from "react-native-purchases";
import { createQuery } from "react-query-kit";
import type { User } from "@/lib/models";
import { segmentClient } from "@/lib/segment";
import { supabase } from "@/lib/supabase";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

export const useCurrentUserQuery = createQuery<User>({
  queryKey: ["user"],
  fetcher: async (): Promise<User> => {
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

    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) {
      throw userError;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    const user: User = {
      id: session.user.id,
      email: session.user.email ?? "",
      name:
        ((authUser?.user_metadata?.name ??
          authUser?.user_metadata?.full_name) as string) ?? "",
      profile: profile ?? undefined,
    };

    Sentry.setUser({
      id: user.id,
      username: user.email,
      email: user.email,
    });

    if (!IS_E2E) {
      await Purchases.logIn(user.id);
      Purchases.setEmail(user.email);
      if (user.name) {
        Purchases.setDisplayName(user.name);
      }

      await segmentClient.identify(user.id, {
        email: user.email,
        name: user.name,
      });
    }

    return user;
  },
  retry: false,
});
