import { HStack } from "~/components/ui/hstack";
import { VStack } from "~/components/ui/vstack";
import { Text } from "~/components/ui/text";
import { Stack, useLocalSearchParams } from "expo-router";
import { usePlanQuery } from "~/hooks/queries/plans";
import { RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import React from "react";
import WorkoutList from "~/components/views/workout-list";
import { Button } from "~/components/ui/button";
import { Plus } from "~/lib/icons/Plus";

export default function PlanScreen() {
  const { planId } = useLocalSearchParams();

  const {
    data: plan,
    isLoading,
    refetch,
  } = usePlanQuery({
    variables: {
      id: Number(planId),
    },
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: plan?.name ?? "",
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <ScrollView
            className="flex-1 p-6"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={refetch} />
            }
          >
            {plan && (
              <VStack className="flex-1 items-stretch">
                <WorkoutList workouts={plan.workouts} />
              </VStack>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
