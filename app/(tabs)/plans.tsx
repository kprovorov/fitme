import PlansListView from "@/components/views/plans-list-view";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";

export default function PlansScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <ScrollView>
          <Padding>
            <PlansListView />
          </Padding>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
