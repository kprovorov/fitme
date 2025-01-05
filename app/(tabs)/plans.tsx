import PlansListView from "@/components/views/plans-list-view";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PlansScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <ScrollView className="p-4">
          <PlansListView />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
