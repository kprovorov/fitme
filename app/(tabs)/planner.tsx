import PlannerView from "@/components/views/planner-view";
import React from "react";
import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function Planner() {
  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <ScrollView className="p-4">
          <PlannerView />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
