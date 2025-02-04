import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { HapticTab } from "@/components/HapticTab";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { UserRound } from "~/lib/icons/UserRound";
import Authenticated from "~/components/authenticated";
import { ClipboardList } from "~/lib/icons/ClipboardList";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Authenticated>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarBackground: TabBarBackground,
          tabBarStyle: Platform.select({
            ios: {
              // Use a transparent background on iOS to show the blur effect
              // position: "absolute",
            },
            default: {},
          }),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Workout",
            tabBarIcon: ({ color }) => <BicepsFlexed size={28} color={color} />,
          }}
        />
        <Tabs.Screen
          name="workout-plans"
          options={{
            title: "Workout Plans",
            tabBarIcon: ({ color }) => (
              <ClipboardList size={28} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color }) => <UserRound size={28} color={color} />,
          }}
        />
      </Tabs>
    </Authenticated>
  );
}
