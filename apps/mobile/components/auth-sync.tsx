import { useUser } from "@clerk/expo";
import { measurementSystems } from "@fitme/core";
import type { MeasurementSystem } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import Purchases from "react-native-purchases";

import { clearAddedSets } from "~/hooks/added-sets";
import { clearArnoldAttachments } from "~/hooks/arnold-attachments";
import { useProfileQuery } from "~/hooks/queries/profiles";
import type { AnalyticsTraits } from "~/lib/analytics";
import { analytics } from "~/lib/analytics";
import { IS_E2E } from "~/lib/constants";

/** The Profile's measurement system as it has it, or nothing for one unknown. */
const knownMeasurementSystem = (
  value: string | undefined
): MeasurementSystem | undefined =>
  // SAFETY: measurementSystems holds only string literals; the widened view stays readonly.
  (measurementSystems as readonly string[]).includes(value ?? "")
    ? (value as MeasurementSystem)
    : undefined;

/** Who was identified last, and as what, so nothing unchanged goes again. */
interface Identified {
  readonly traits: AnalyticsTraits;
  readonly userId: string;
}

const sameTraits = (a: AnalyticsTraits, b: AnalyticsTraits): boolean =>
  a.email === b.email &&
  a.name === b.name &&
  a.measurement_system === b.measurement_system;

/**
 * Keys Sentry, RevenueCat and analytics on the signed-in Clerk User, and on
 * sign-out clears the query cache, the Attachments picked for Arnold and the
 * sets added to a Workout Session but not logged, and logs out of RevenueCat.
 *
 * Analytics: whenever Clerk has loaded with nobody signed in (a log-out, a
 * deleted account, a session that ended on its own, now or before this
 * launch) the identity is reset, which the wrapper does once per sign-out.
 * The signed-in User is identified by their id with their email, name and,
 * once the Profile has been read, its measurement system, and identified
 * again whenever one of those changes. A Profile read that failed identifies
 * with what is known.
 */
const AuthSync = () => {
  const queryClient = useQueryClient();
  const { isLoaded, user } = useUser();
  const signedInUserId = useRef<string | null>(null);
  const identified = useRef<Identified | null>(null);

  const userId = user?.id;
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName ?? "";

  const profile = useProfileQuery({ enabled: Boolean(userId) });
  // Settled once read or failed: identify waits for it, so a User with a
  // Profile is identified once with it rather than first without.
  const profileSettled = Boolean(userId) && !profile.isPending;

  const measurementSystem = knownMeasurementSystem(
    profile.data?.measurement_system
  );

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!userId) {
      // However the session ended: the wrapper resets only while someone
      // is identified, so this runs once per sign-out.
      identified.current = null;
      void analytics.reset();

      if (signedInUserId.current) {
        signedInUserId.current = null;
        Sentry.setUser(null);
        queryClient.clear();
        // Photos picked but never sent are a draft of theirs, like the
        // query cache: whoever signs in next never meets them.
        clearArnoldAttachments();
        clearAddedSets();

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
      void queryClient.invalidateQueries();
    }

    // The Clerk id only: no email or name reaches Sentry.
    Sentry.setUser({ id: userId });

    // An E2E build configures no RevenueCat.
    if (IS_E2E) {
      return;
    }

    const identifyToRevenueCat = async () => {
      if (isNewUser) {
        await Purchases.logIn(userId);
        await queryClient.invalidateQueries({ queryKey: ["rc-is-pro"] });
      }

      await Purchases.setEmail(email);

      if (name) {
        await Purchases.setDisplayName(name);
      }
    };

    identifyToRevenueCat().catch(Sentry.captureException);
  }, [email, isLoaded, name, queryClient, userId]);

  useEffect(() => {
    if (!(isLoaded && userId && profileSettled)) {
      return;
    }

    const last =
      identified.current?.userId === userId ? identified.current : null;

    // A refresh that failed with nothing read leaves the measurement system
    // as last sent rather than identifying without it.
    const system = measurementSystem ?? last?.traits.measurement_system;

    const traits: AnalyticsTraits = system
      ? { email, measurement_system: system, name }
      : { email, name };

    if (last && sameTraits(last.traits, traits)) {
      return;
    }

    identified.current = { traits, userId };
    // The wrapper decides for itself whether it sends.
    analytics.identify(userId, traits).catch(Sentry.captureException);
  }, [email, isLoaded, measurementSystem, name, profileSettled, userId]);

  useEffect(() => {
    if (IS_E2E) {
      return;
    }

    const listener = () => {
      void queryClient.invalidateQueries({ queryKey: ["rc-is-pro"] });
      void queryClient.invalidateQueries({ queryKey: ["rc-customer-info"] });
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient]);

  return null;
};

export default AuthSync;
