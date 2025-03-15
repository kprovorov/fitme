import React from "react";
import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { VStack } from "~/components/ui/vstack";
import ProfileView from "~/components/views/profile-view";
import { Text } from "~/components/ui/text";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

export default function ProfileScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <VStack className="items-stretch p-6 h-full justify-between gap-0">
          <ProfileView />
          <Button
            variant="link"
            onPress={() =>
              Linking.openURL("https://fitmeproject.com/privacy-policy")
            }
          >
            <Text className="text-muted-foreground">Privacy Policy</Text>
          </Button>
          <Button
            variant="link"
            onPress={() => Linking.openURL("https://fitmeproject.com/terms")}
          >
            <Text className="text-muted-foreground">Terms of Service</Text>
          </Button>
        </VStack>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
