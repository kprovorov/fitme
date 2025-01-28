import React from "react";
import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import ProfileView from "~/components/views/profile-view";

export default function ProfileScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <Padding>
          <ProfileView />
        </Padding>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
