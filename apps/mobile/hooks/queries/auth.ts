import type { User } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import Purchases from "react-native-purchases";
import { createQuery } from "react-query-kit";
import { segmentClient } from "@/lib/segment";
import { supabase } from "@/lib/supabase";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

export const useCurrentUserQuery = createQuery<User>({
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

    const user: User = {
      email: session.user.email ?? "",
      id: session.user.id,
      name:
        ((authUser?.user_metadata?.name ??
          authUser?.user_metadata?.full_name) as string | undefined) ?? "",
    };

    Sentry.setUser({
      email: user.email,
      id: user.id,
      username: user.email,
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
  queryKey: ["user"],
  retry: false,
});
