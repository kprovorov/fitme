import { useUser } from "@clerk/expo";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import Purchases from "react-native-purchases";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";

/**
 * Keys Sentry, RevenueCat and Segment on the signed-in Clerk User, and on
 * sign-out clears the query cache and logs out of RevenueCat.
 */
export default function AuthSync() {
  const queryClient = useQueryClient();
  const { isLoaded, user } = useUser();
  const signedInUserId = useRef<string | null>(null);

  const userId = user?.id;
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName ?? "";

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!userId) {
      if (signedInUserId.current) {
        signedInUserId.current = null;
        Sentry.setUser(null);
        queryClient.clear();
        if (!IS_E2E) {
          Purchases.logOut().catch(Sentry.captureException);
        }
      }
      return;
    }

    const isNewUser = signedInUserId.current !== userId;
    signedInUserId.current = userId;

    if (isNewUser) {
      // Screens outside the tabs (deep links) can query before Clerk loads,
      // with only the anon key; refetch them as the User.
      queryClient.invalidateQueries();
    }

    // The Clerk id only: no email or name reaches Sentry.
    Sentry.setUser({ id: userId });

    if (IS_E2E) {
      return;
    }

    const identify = async () => {
      if (isNewUser) {
        await Purchases.logIn(userId);
        await queryClient.invalidateQueries({ queryKey: ["rc-is-pro"] });
      }
      await Purchases.setEmail(email);
      if (name) {
        await Purchases.setDisplayName(name);
      }
      await segmentClient.identify(userId, { email, name });
    };
    identify().catch(Sentry.captureException);
  }, [email, isLoaded, name, queryClient, userId]);

  useEffect(() => {
    if (IS_E2E) {
      return;
    }
    const listener = () =>
      queryClient.invalidateQueries({ queryKey: ["rc-is-pro"] });
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient]);

  return null;
}
