import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { MenuList } from "~/components/ui/menu-list";
import {
  RadioGroup,
  RadioGroupMenuListItem,
} from "~/components/ui/radio-group";
import { Text } from "~/components/ui/text";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { useUpdateMeasurementSystemMutation } from "~/hooks/queries/settings";
import {
  getMeasurementSystemDisclaimer,
  getMeasurementSystemLabel,
} from "~/lib/labels";
import { type MeasurementSystem, measurementSystems } from "~/lib/models";
export default function MeasurementSystemScreen() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const [measurementSystemValue, setMeasurementSystemValue] =
    useState<MeasurementSystem>(user?.profile?.measurement_system || "metric");

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
      <SafeAreaView className="flex-1">
        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          <RadioGroup
            onValueChange={(newValue) =>
              handleUpdateMeasurementSystem(newValue as MeasurementSystem)
            }
            value={measurementSystemValue}
          >
            <MenuList>
              <AlertDialog>
                {measurementSystems.map((system, i) => (
                  <AlertDialogTrigger asChild key={system}>
                    <RadioGroupMenuListItem
                      className={i === 0 ? "" : "border-border border-t"}
                      disclaimer={getMeasurementSystemDisclaimer(system)}
                      label={getMeasurementSystemLabel(system)}
                      value={system}
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
                          user?.profile?.measurement_system || "metric"
                        )
                      }
                    >
                      <Text>Cancel</Text>
                    </AlertDialogCancel>
                    <AlertDialogAction onPress={confirmMeasurementSystemChange}>
                      <Text>Confirm</Text>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </MenuList>
          </RadioGroup>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
