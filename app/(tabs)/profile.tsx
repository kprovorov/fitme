import React from "react";
import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ProfileView from "~/components/views/profile-view";

export default function LoginScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <ScrollView className="p-4">
          <ProfileView />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
