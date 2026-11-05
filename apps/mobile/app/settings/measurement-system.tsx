import { rateLimitedFor } from "@fitme/api-client";
import { measurementSystems } from "@fitme/core";
import type { MeasurementSystem } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, View } from "react-native";

import { AlertDialog } from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { RadioGroup } from "~/components/ui/radio-group";
import { VStack } from "~/components/ui/vstack";
import { seedProfile } from "~/hooks/mutations/profiles";
import { useProfileQuery } from "~/hooks/queries/profiles";
import type { Profile } from "~/hooks/queries/profiles";
import {
  invalidateWeighedQueries,
  rememberPendingWeighedRefresh,
  useUpdateMeasurementSystemMutation,
} from "~/hooks/queries/settings";
import { useChoiceLabels } from "~/lib/choices";
import { i18n } from "~/lib/i18n";
import { measurementSystemOf } from "~/lib/profile";
import { isStillWriteStarter } from "~/lib/write-answers";
import type { WriteStarter } from "~/lib/write-answers";

/**
 * The system a switch left saved, decided only from a Profile it has: the
 * answer, once it shows as the Profile; the Profile read again when a newer
 * one had landed meanwhile and that read succeeded; or else (no answer, a
 * failed call whose conversion may still have committed, or that read
 * failed) the Profile read back. `saved` is `undefined`
 * when that read fails: the Profile is then dropped, not just marked stale,
 * so no Screen keeps showing or submitting a height and weight that may be
 * in the old units, and the switch to `system` is remembered so the next
 * Profile read that lands can confirm it and refresh every weight. `null` once another User has signed in, checked again
 * after every await: nothing is theirs to read, seed or reset (signing out
 * cancels the read back, and a reset would cancel the next User's read).
 */
const readSavedSystem = async (
  queryClient: QueryClient,
  system: MeasurementSystem,
  answer: Profile | undefined,
  starter: WriteStarter | undefined
): Promise<{ saved: MeasurementSystem | undefined } | null> => {
  if (answer) {
    const seeded = await seedProfile(queryClient, answer, starter);

    if (seeded === "signed-out") {
      return null;
    }

    if (seeded === "seeded") {
      return { saved: measurementSystemOf(answer) };
    }

    // Superseded: the helper has read the Profile again. Once that read
    // landed (a read that lands clears `isInvalidated`, a failed one leaves
    // it set), it already shows the system saved after the switch.
    const reconciled = queryClient.getQueryState(useProfileQuery.getKey());

    if (reconciled?.status === "success" && !reconciled.isInvalidated) {
      return {
        saved: measurementSystemOf(reconciled.data as Profile | null),
      };
    }
  }

  if (!isStillWriteStarter(starter)) {
    return null;
  }

  try {
    const fresh = await queryClient.fetchQuery({
      ...useProfileQuery.getFetchOptions(),
      staleTime: 0,
    });

    return isStillWriteStarter(starter)
      ? { saved: measurementSystemOf(fresh) }
      : null;
  } catch (fetchError) {
    if (!isStillWriteStarter(starter)) {
      return null;
    }

    // Too many requests is the User's to wait out, not a bug.
    if (rateLimitedFor(fetchError) === null) {
      Sentry.captureException(fetchError);
    }

    // The conversion may well have committed, so the weighed queries are
    // left in their old unit with their old numbers, and the next Profile
    // read that lands says whether it did (FIT-553). Remembered before the
    // Profile is dropped, so the read that dropping it starts already counts.
    rememberPendingWeighedRefresh(queryClient, system, starter);
    queryClient.resetQueries({ queryKey: useProfileQuery.getKey() });

    return { saved: undefined };
  }
};

/** Tells the User a switch couldn't be checked, or didn't land. */
const alertSwitchResult = (
  saved: MeasurementSystem | undefined,
  error: Error | null,
  system: MeasurementSystem
) => {
  if (saved === undefined) {
    Alert.alert(
      i18n.t("measurementSystem.checkFailed.title"),
      i18n.t("measurementSystem.checkFailed.message")
    );
  } else if (error && saved !== system) {
    const waitSeconds = rateLimitedFor(error);
    Alert.alert(
      i18n.t("measurementSystem.changeFailed.title"),
      waitSeconds === null
        ? i18n.t("measurementSystem.changeFailed.message")
        : i18n.t("measurementSystem.changeFailed.rateLimited", {
            seconds: waitSeconds,
          })
    );
  }
};

export default function MeasurementSystemScreen() {
  const queryClient = useQueryClient();
  const labels = useChoiceLabels();
  const { t } = useTranslation(undefined, { i18n });

  const options = useMemo(
    () =>
      measurementSystems.map((system) => ({
        label: labels.measurementSystem(system),
        value: system,
      })),
    [labels]
  );

  const {
    data: profile,
    error: profileError,
    isError: isProfileError,
    refetch,
  } = useProfileQuery();

  // A switch can finish after the User has gone back; its alerts would then
  // show over another Screen.
  const isMounted = useRef<boolean>(true);
  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  /** The saved system, or `undefined` until the Profile has loaded. */
  const savedSystem: MeasurementSystem | undefined =
    profile === undefined ? undefined : measurementSystemOf(profile);

  /** The option awaiting confirmation, or `null` when nothing is pending. */
  const [pendingSystem, setPendingSystem] = useState<MeasurementSystem | null>(
    null
  );

  /**
   * The system being switched to, from Confirm until the Profile has been
   * read again, or `null` when no switch is running. Set in the same handler
   * that clears `pendingSystem`, so the picker never has a render in between
   * showing the old system.
   */
  const [switchingTo, setSwitchingTo] = useState<MeasurementSystem | null>(
    null
  );

  const { mutate: updateMeasurementSystem } =
    useUpdateMeasurementSystemMutation({
      onError: (error) => {
        // Too many requests is the User's to wait out, not a bug.
        if (rateLimitedFor(error) === null) {
          Sentry.captureException(error);
        }
      },
      // The answer is the converted Profile, which shows as is. A failed call
      // doesn't prove nothing changed (the response can be lost after the
      // conversion commits), and the cached Profile's height and weight are
      // in the old units either way, so the Profile is then read again, and
      // the picker stays on the new system until it has been.
      onSettled: async (answer, error, system, starter) => {
        const result = await readSavedSystem(
          queryClient,
          system,
          answer,
          starter
        );

        setSwitchingTo(null);

        // Another User signed in meanwhile: nothing here is theirs to
        // re-read, and no alert is theirs either.
        if (result === null) {
          return;
        }

        const { saved } = result;

        // Once the Profile says the new system is saved, every stored weight
        // is in it, so every Screen showing one is read again (FIT-539). It
        // waits for the Profile, the unit those Screens show: a Profile that
        // can't be read back then leaves their old numbers under their old
        // unit, rather than converted ones under a unit that fell back to
        // metric. A lost answer can hide a conversion that committed, so the
        // error is no reason to skip it; a switch that didn't land re-reads
        // nothing. Not awaited: nothing below needs it, and History's paged
        // read would hold the picker disabled for the whole thing.
        if (saved === system) {
          invalidateWeighedQueries(queryClient);
        }

        if (isMounted.current) {
          alertSwitchResult(saved, error, system);
        }
      },
    });

  const isLoaded = savedSystem !== undefined;
  // A failed first read: too many requests gives the wait.
  const loadWaitSeconds = rateLimitedFor(profileError);
  const isSwitching = switchingTo !== null;

  // The native picker keeps whatever was tapped until its `value` changes, so
  // it's handed the tapped option while that's pending or switching, and the
  // saved system again after Cancel or a failure.
  const shownSystem = pendingSystem ?? switchingTo ?? savedSystem;

  const handleValueChange = useCallback(
    (system: MeasurementSystem) => {
      if (!isLoaded || isSwitching || system === savedSystem) {
        return;
      }

      setPendingSystem(system);
    },
    [isLoaded, isSwitching, savedSystem]
  );

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleIsPresentedChange = useCallback((isPresented: boolean) => {
    if (!isPresented) {
      setPendingSystem(null);
    }
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: t("measurementSystem.title"),
        }}
      />
      {!(isLoaded || isProfileError) && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            colorClassName="accent-foreground"
            testID="measurement-system-loading"
          />
        </View>
      )}
      {!isLoaded && isProfileError && (
        <VStack className="flex-1 items-stretch justify-center gap-4 p-6">
          <ErrorMessage className="text-center">
            {loadWaitSeconds === null
              ? t("measurementSystem.loadError")
              : t("common.rateLimited", { seconds: loadWaitSeconds })}
          </ErrorMessage>
          <Button
            label={t("common.tryAgain")}
            onPress={handleRetry}
            variant="secondary"
          />
        </VStack>
      )}
      {savedSystem !== undefined && (
        <View className="flex-1">
          <RadioGroup
            disabled={isSwitching}
            footer={labels.measurementSystemDescription(
              shownSystem ?? savedSystem
            )}
            onValueChange={handleValueChange}
            options={options}
            value={shownSystem ?? savedSystem}
          />

          <AlertDialog
            actions={[
              { label: t("common.cancel"), role: "cancel" },
              {
                label: t("common.confirm"),
                onPress: () => {
                  if (pendingSystem) {
                    setSwitchingTo(pendingSystem);
                    updateMeasurementSystem(pendingSystem);
                  }

                  setPendingSystem(null);
                },
              },
            ]}
            isPresented={pendingSystem !== null}
            message={t("measurementSystem.confirm.message")}
            onIsPresentedChange={handleIsPresentedChange}
            title={t("measurementSystem.confirm.title")}
          />
        </View>
      )}
    </>
  );
}
