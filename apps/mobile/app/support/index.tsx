import { Stack } from "expo-router";
import { Linking, ScrollView, View } from "react-native";
import { useCSSVariable } from "uniwind";
import Instagram from "~/components/icons/social/instagram";
import Threads from "~/components/icons/social/threads";
import X from "~/components/icons/social/x";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";

/**
 * A 16 pt logo in a 44 pt-wide tap target (the ghost Button gives the
 * height), aligned with the text above it.
 */
const LOGO_TARGET_CLASS = "w-11 items-start";

const openSupportEmail = () =>
  Linking.openURL("mailto:support@fitmeproject.com");
const openX = () => Linking.openURL("https://x.com/fitmeproject");
const openInstagram = () =>
  Linking.openURL("https://www.instagram.com/fitmeprojectcom");
const openThreads = () =>
  Linking.openURL("https://www.threads.net/@fitmeprojectcom");

export default function SupportScreen() {
  const primary = useCSSVariable("--color-primary") as string;

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
            contentColorClassName="text-primary"
            label="support@fitmeproject.com"
            onPress={openSupportEmail}
            variant="ghost"
          />
          <HStack className="gap-0">
            <Button accessibilityLabel="X" onPress={openX} variant="ghost">
              <View className={LOGO_TARGET_CLASS}>
                <X fill={primary} height={16} width={16} />
              </View>
            </Button>
            <Button
              accessibilityLabel="Instagram"
              onPress={openInstagram}
              variant="ghost"
            >
              <View className={LOGO_TARGET_CLASS}>
                <Instagram fill={primary} height={16} width={16} />
              </View>
            </Button>
            <Button
              accessibilityLabel="Threads"
              onPress={openThreads}
              variant="ghost"
            >
              <View className={LOGO_TARGET_CLASS}>
                <Threads fill={primary} height={16} width={16} />
              </View>
            </Button>
          </HStack>
        </VStack>
      </ScrollView>
    </>
  );
}
