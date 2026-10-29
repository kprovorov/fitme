import { type MeasurementSystem, measurementSystems } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { RadioGroup } from "~/components/ui/radio-group";
import { VStack } from "~/components/ui/vstack";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useUpdateMeasurementSystemMutation } from "~/hooks/queries/settings";
import { rateLimitedFor } from "~/lib/api/client";
import { useChoiceLabels } from "~/lib/choices";

export default function MeasurementSystemScreen() {
  const queryClient = useQueryClient();
  const labels = useChoiceLabels();
  const options = useMemo(
    () =>
      measurementSystems.map((system) => ({
        label: labels.measurementSystem(system),
        value: system,
      })),
    [labels]
  );

  const { data: profile, isError: isProfileError, refetch } = useProfileQuery();

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
    profile === undefined
      ? undefined
      : (profile?.measurement_system ?? "metric");

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
      // A failed call doesn't prove nothing changed (the response can be lost
      // after the conversion commits), and the cached Profile's height and
      // weight are in the old units either way, so the Profile is read again
      // and the picker stays on the new system until it has been.
      onSettled: async (_data, error, system) => {
        let saved: MeasurementSystem | undefined;
        try {
          const fresh = await queryClient.fetchQuery({
            ...useProfileQuery.getFetchOptions(),
            staleTime: 0,
          });
          saved = fresh?.measurement_system ?? "metric";
        } catch (fetchError) {
          Sentry.captureException(fetchError);
          // Dropped, not just marked stale, so no Screen keeps showing or
          // submitting a height and weight that may be in the old units.
          queryClient.resetQueries({ queryKey: useProfileQuery.getKey() });
        }
        setSwitchingTo(null);

        if (!isMounted.current) {
          return;
        }
        if (saved === undefined) {
          Alert.alert(
            "Couldn't Check Your Units",
            "Check your connection, then try again to see which system is saved."
          );
        } else if (error && saved !== system) {
          const waitSeconds = rateLimitedFor(error);
          Alert.alert(
            "Couldn't Change Units",
            waitSeconds === null
              ? "Your measurements weren't changed. Please try again."
              : `Your measurements weren't changed. Too many requests: please try again in ${waitSeconds} s.`
          );
        }
      },
    });

  const isLoaded = savedSystem !== undefined;
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
          title: "Measurement System",
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
            Couldn't load your measurement system. Please check your connection
            and try again.
          </ErrorMessage>
          <Button label="Try Again" onPress={handleRetry} variant="secondary" />
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
              { label: "Cancel", role: "cancel" },
              {
                label: "Confirm",
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
            message="Updating your measurement system will affect all of your measurements. Your profile data and workout history will be converted to the new system."
            onIsPresentedChange={handleIsPresentedChange}
            title="Are you sure?"
          />
        </View>
      )}
    </>
  );
}
