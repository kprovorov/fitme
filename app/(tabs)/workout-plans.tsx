import React from "react";
import WorkoutPlansListView from "@/components/views/workout-plans-list-view";
import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";

export default function WorkoutPlansScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <ScrollView>
          <Padding>
            <WorkoutPlansListView />
          </Padding>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
