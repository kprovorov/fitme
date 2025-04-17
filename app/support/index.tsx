import React from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Linking, ScrollView } from "react-native";
import { Text } from "~/components/ui/text";
import { Link, Stack } from "expo-router";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { HStack } from "~/components/ui/hstack";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { getMeasurementSystemLabel } from "~/lib/labels";
import X from "~/components/icons/social/x";
import Instagram from "~/components/icons/social/instagram";
import Threads from "~/components/icons/social/threads";
import { Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { Button } from "~/components/ui/button";

export default function SupportScreen() {
  const { data: user } = useCurrentUserQuery();

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: "Support",
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <ScrollView
            className="flex-1 p-6"
            showsVerticalScrollIndicator={false}
          >
            <VStack className="items-start gap-0">
              <P>
                Feel free to contact us at any time if you have any questions or
                feedback
              </P>
              <Button
                variant="link"
                className="p-0 h-8"
                onPress={() =>
                  Linking.openURL("mailto:support@fitmeproject.com")
                }
              >
                <Text>support@fitmeproject.com</Text>
              </Button>
              <HStack>
                <Button
                  variant="link"
                  className="p-0 h-8"
                  onPress={() => Linking.openURL("https://x.com/fitmeproject")}
                >
                  <X fill="#97DE71" height={16} width={16} />
                </Button>
                <Button
                  variant="link"
                  className="p-0 h-8"
                  onPress={() =>
                    Linking.openURL("https://www.instagram.com/fitmeprojectcom")
                  }
                >
                  <Instagram fill="#97DE71" height={16} width={16} />
                </Button>
                <Button
                  variant="link"
                  className="p-0 h-8"
                  onPress={() =>
                    Linking.openURL("https://www.threads.net/@fitmeprojectcom")
                  }
                >
                  <Threads fill="#97DE71" height={16} width={16} />
                </Button>
              </HStack>
            </VStack>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
