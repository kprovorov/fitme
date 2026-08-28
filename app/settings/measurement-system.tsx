import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { RadioGroup } from "~/components/ui/radio-group";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { useUpdateMeasurementSystemMutation } from "~/hooks/queries/settings";
import {
  getMeasurementSystemDisclaimer,
  getMeasurementSystemLabel,
} from "~/lib/labels";
import { type MeasurementSystem, measurementSystems } from "~/lib/models";

const MEASUREMENT_SYSTEM_OPTIONS = measurementSystems.map((system) => ({
  value: system,
  label: getMeasurementSystemLabel(system),
}));

export default function MeasurementSystemScreen() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const currentSystem: MeasurementSystem =
    user?.profile?.measurement_system || "metric";

  /** The option awaiting confirmation, or `null` when nothing is pending. */
  const [pendingSystem, setPendingSystem] = useState<MeasurementSystem | null>(
    null
  );

  const { mutate: updateMeasurementSystem } =
    useUpdateMeasurementSystemMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["user"] });
      },
    });

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Measurement System",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <View className="flex-1">
        <RadioGroup
          footer={getMeasurementSystemDisclaimer(currentSystem)}
          onValueChange={setPendingSystem}
          options={MEASUREMENT_SYSTEM_OPTIONS}
          value={currentSystem}
        />

        <AlertDialog
          actions={[
            { label: "Cancel", role: "cancel" },
            {
              label: "Confirm",
              onPress: () => {
                if (pendingSystem) {
                  updateMeasurementSystem(pendingSystem);
                }
                setPendingSystem(null);
              },
            },
          ]}
          isPresented={pendingSystem !== null}
          message="Updating your measurement system will affect all of your measurements. Your profile data and workout history will be converted to the new system."
          onIsPresentedChange={(isPresented) => {
            if (!isPresented) {
              setPendingSystem(null);
            }
          }}
          title="Are you sure?"
        />
      </View>
    </>
  );
}
