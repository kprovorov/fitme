import PlannerView from "@/components/views/planner-view";
import React from "react";
import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
export default function Planner() {
  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <Padding className="h-full">
          <PlannerView />
        </Padding>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
