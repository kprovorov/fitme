import {
  getMeasurementSystemDisclaimer,
  getMeasurementSystemLabel,
  type MeasurementSystem,
  measurementSystems,
} from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { RadioGroup } from "~/components/ui/radio-group";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useUpdateMeasurementSystemMutation } from "~/hooks/queries/settings";

const MEASUREMENT_SYSTEM_OPTIONS = measurementSystems.map((system) => ({
  label: getMeasurementSystemLabel(system),
  value: system,
}));

export default function MeasurementSystemScreen() {
  const queryClient = useQueryClient();

  const { data: profile } = useProfileQuery();

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
        Sentry.captureException(error);
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
          // So no screen keeps using a Profile that may be in the old units.
          queryClient.invalidateQueries({ queryKey: useProfileQuery.getKey() });
        }
        setSwitchingTo(null);

        if (saved === undefined) {
          Alert.alert(
            "Couldn't Check Your Units",
            "Check your connection, then open this screen again to see which system is saved."
          );
        } else if (error && saved !== system) {
          Alert.alert(
            "Couldn't Change Units",
            "Your measurements weren't changed. Please try again."
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
      <View className="flex-1">
        <RadioGroup
          disabled={!isLoaded || isSwitching}
          footer={shownSystem && getMeasurementSystemDisclaimer(shownSystem)}
          onValueChange={handleValueChange}
          options={MEASUREMENT_SYSTEM_OPTIONS}
          value={shownSystem}
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
    </>
  );
}
