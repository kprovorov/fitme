import { Stack } from "expo-router";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import CreateWorkoutPlanView from "~/components/views/create-workout-plan-view";

export default function CreateWorkoutPlanScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Create Workout Plan",
          headerBackTitle: "plans",
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <Padding>
            <CreateWorkoutPlanView />
          </Padding>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
