import React from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { Text } from "~/components/ui/text";
import { Link, Stack } from "expo-router";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { HStack } from "~/components/ui/hstack";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { getMeasurementSystemLabel } from "~/lib/labels";

export default function SettingsScreen() {
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
          title: "Settings",
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <ScrollView
            className="flex-1 p-4"
            showsVerticalScrollIndicator={false}
          >
            {!!user && (
              <MenuList>
                <Link href="/settings/measurement-system" asChild>
                  <MenuListItem>
                    <HStack className="flex-1 justify-between">
                      <Text>Measurement System</Text>
                      <Text className="text-muted-foreground text-xs">
                        {getMeasurementSystemLabel(user.measurement_system)}
                      </Text>
                    </HStack>
                  </MenuListItem>
                </Link>
              </MenuList>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
