import React from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useWorkoutPlanQuery } from "~/hooks/queries/workout-plans";
import WorkoutsListView from "~/components/views/workouts-list-view";
import { Padding } from "~/components/ui/padding";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";

export default function FinishedWorkoutsScreen() {
  const { id } = useLocalSearchParams();

  const {
    data: plan,
    isLoading,
    error,
  } = useWorkoutPlanQuery({
    variables: { id: Number(id) },
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: "Finished Workouts",
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <ScrollView className="h-full p-6">
            {!!plan && (
              <WorkoutsListView
                workouts={plan.workouts.filter(
                  (workout) => workout.finished_at
                )}
              />
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
