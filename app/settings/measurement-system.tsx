import { Stack } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView, ScrollView, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { MenuList } from "~/components/ui/menu-list";
import {
  RadioGroup,
  RadioGroupMenuListItem,
} from "~/components/ui/radio-group";
import { Separator } from "~/components/ui/separator";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { getMeasurementSystemDisclaimer } from "~/lib/labels";
import { getMeasurementSystemLabel } from "~/lib/labels";
import { MeasurementSystem, measurementSystems } from "~/lib/models";
import { useUpdateMeasurementSystemMutation } from "~/hooks/queries/settings";
import { useQueryClient } from "@tanstack/react-query";

export default function MeasurementSystemScreen() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const [value, setValue] = useState<MeasurementSystem>(
    user?.measurement_system || "metric"
  );

  const { mutate: updateMeasurementSystem } =
    useUpdateMeasurementSystemMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["user"] });
      },
    });

  const handleUpdateMeasurementSystem = (
    measurementSystem: MeasurementSystem
  ) => {
    setValue(measurementSystem);
    updateMeasurementSystem(measurementSystem);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: "Measurement System",
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <ScrollView
            className="flex-1 p-4"
            showsVerticalScrollIndicator={false}
          >
            <RadioGroup
              value={value}
              onValueChange={(newValue) =>
                handleUpdateMeasurementSystem(newValue as MeasurementSystem)
              }
            >
              <MenuList>
                {measurementSystems.map((system, i) => (
                  <RadioGroupMenuListItem
                    key={system}
                    value={system}
                    label={getMeasurementSystemLabel(system)}
                    disclaimer={getMeasurementSystemDisclaimer(system)}
                    className={i !== 0 ? "border-t border-border" : ""}
                  />
                ))}
              </MenuList>
            </RadioGroup>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
