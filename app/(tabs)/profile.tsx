import React from "react";
import { SafeAreaView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { VStack } from "~/components/ui/vstack";
import ProfileView from "~/components/views/profile-view";

export default function ProfileScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <VStack className="items-stretch p-6 h-full justify-between gap-0">
          <ProfileView />
        </VStack>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
