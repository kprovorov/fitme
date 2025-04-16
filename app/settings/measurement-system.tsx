import { Stack } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { MenuList } from "~/components/ui/menu-list";
import {
  RadioGroup,
  RadioGroupMenuListItem,
} from "~/components/ui/radio-group";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { getMeasurementSystemDisclaimer } from "~/lib/labels";
import { getMeasurementSystemLabel } from "~/lib/labels";
import { MeasurementSystem, measurementSystems } from "~/lib/models";
import { useUpdateMeasurementSystemMutation } from "~/hooks/queries/settings";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { Text } from "~/components/ui/text";
export default function MeasurementSystemScreen() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const [measurementSystemValue, setMeasurementSystemValue] =
    useState<MeasurementSystem>(user?.measurement_system || "metric");

  const { mutate: updateMeasurementSystem } =
    useUpdateMeasurementSystemMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["user"] });
      },
    });

  const handleUpdateMeasurementSystem = (
    measurementSystem: MeasurementSystem
  ) => {
    setMeasurementSystemValue(measurementSystem);
  };

  const confirmMeasurementSystemChange = () => {
    updateMeasurementSystem(measurementSystemValue);
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
              value={measurementSystemValue}
              onValueChange={(newValue) =>
                handleUpdateMeasurementSystem(newValue as MeasurementSystem)
              }
            >
              <MenuList>
                <AlertDialog>
                  {measurementSystems.map((system, i) => (
                    <AlertDialogTrigger key={system} asChild>
                      <RadioGroupMenuListItem
                        value={system}
                        label={getMeasurementSystemLabel(system)}
                        disclaimer={getMeasurementSystemDisclaimer(system)}
                        className={i !== 0 ? "border-t border-border" : ""}
                      />
                    </AlertDialogTrigger>
                  ))}
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Updating your measurement system will affect all of your
                        measurements. Your profile data and workout history will
                        be converted to the new system.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel
                        onPress={() =>
                          setMeasurementSystemValue(
                            user?.measurement_system || "metric"
                          )
                        }
                      >
                        <Text>Cancel</Text>
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onPress={confirmMeasurementSystemChange}
                      >
                        <Text>Confirm</Text>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </MenuList>
            </RadioGroup>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
