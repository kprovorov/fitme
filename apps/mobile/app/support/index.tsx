import { Stack } from "expo-router";
import { Linking, ScrollView } from "react-native";
import Instagram from "~/components/icons/social/instagram";
import Threads from "~/components/icons/social/threads";
import X from "~/components/icons/social/x";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";

const openSupportEmail = () =>
  Linking.openURL("mailto:support@fitmeproject.com");
const openX = () => Linking.openURL("https://x.com/fitmeproject");
const openInstagram = () =>
  Linking.openURL("https://www.instagram.com/fitmeprojectcom");
const openThreads = () =>
  Linking.openURL("https://www.threads.net/@fitmeprojectcom");

export default function SupportScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: "Support",
        }}
      />
      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <VStack className="items-start gap-0">
          <P>
            Feel free to contact us at any time if you have any questions or
            feedback
          </P>
          <Button
            label="support@fitmeproject.com"
            onPress={openSupportEmail}
            variant="ghost"
          />
          <HStack>
            <Button accessibilityLabel="X" onPress={openX} variant="ghost">
              <X fill="#C0FF38" height={16} width={16} />
            </Button>
            <Button
              accessibilityLabel="Instagram"
              onPress={openInstagram}
              variant="ghost"
            >
              <Instagram fill="#C0FF38" height={16} width={16} />
            </Button>
            <Button
              accessibilityLabel="Threads"
              onPress={openThreads}
              variant="ghost"
            >
              <Threads fill="#C0FF38" height={16} width={16} />
            </Button>
          </HStack>
        </VStack>
      </ScrollView>
    </>
  );
}
