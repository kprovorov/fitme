import { Stack } from "expo-router";
import { Linking, ScrollView } from "react-native";
import Instagram from "~/components/icons/social/instagram";
import Threads from "~/components/icons/social/threads";
import X from "~/components/icons/social/x";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useCurrentUserQuery } from "~/hooks/queries/auth";

export default function SupportScreen() {
  const { data: _user } = useCurrentUserQuery();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Support",
          headerBackButtonDisplayMode: "minimal",
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
            className="h-8 p-0"
            onPress={() => Linking.openURL("mailto:support@fitmeproject.com")}
            variant="link"
          >
            <Text>support@fitmeproject.com</Text>
          </Button>
          <HStack>
            <Button
              className="h-8 p-0"
              onPress={() => Linking.openURL("https://x.com/fitmeproject")}
              variant="link"
            >
              <X fill="#C0FF38" height={16} width={16} />
            </Button>
            <Button
              className="h-8 p-0"
              onPress={() =>
                Linking.openURL("https://www.instagram.com/fitmeprojectcom")
              }
              variant="link"
            >
              <Instagram fill="#C0FF38" height={16} width={16} />
            </Button>
            <Button
              className="h-8 p-0"
              onPress={() =>
                Linking.openURL("https://www.threads.net/@fitmeprojectcom")
              }
              variant="link"
            >
              <Threads fill="#C0FF38" height={16} width={16} />
            </Button>
          </HStack>
        </VStack>
      </ScrollView>
    </>
  );
}
