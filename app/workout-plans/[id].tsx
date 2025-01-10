import React from "react";
import WorkoutPlanView from "@/components/views/workout-plan-view";
import { Stack, useLocalSearchParams } from "expo-router";
import { useWorkoutPlanQuery } from "@/hooks/queries/workout-plans";
import { Text } from "~/components/ui/text";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";

export default function WorkoutPlanScreen() {
  const { id } = useLocalSearchParams();

  const {
    data: plan,
    isLoading,
    error,
  } = useWorkoutPlanQuery({
    variables: { id: Number(id) },
  });

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <>
      <Stack.Screen
        options={{
          title: `Plan #${plan?.id}`,
          headerBackTitle: "plans",
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <ScrollView>
            <Padding>
              {plan ? (
                <WorkoutPlanView plan={plan} />
              ) : (
                <Text>Plan not found</Text>
              )}
            </Padding>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
