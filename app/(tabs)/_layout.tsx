import { Tabs, TabList, TabTrigger, TabSlot } from "expo-router/ui";
import React from "react";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { UserRound } from "~/lib/icons/UserRound";
import Authenticated from "~/components/authenticated";
import { ClipboardList } from "~/lib/icons/ClipboardList";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HStack } from "~/components/ui/hstack";
import { TabBarButton } from "~/components/ui/tab-bar-button";
import { Href } from "expo-router";

export default function TabLayout() {
  const tabs = [
    {
      name: "home",
      label: "Home",
      href: "/",
      renderIcon: (isFocused: boolean) => (
        <BicepsFlexed
          className={`w-6 h-6 stroke-white ${
            isFocused ? "stroke-primary" : "stroke-white"
          }`}
        />
      ),
    },
    {
      name: "history",
      label: "History",
      href: "/history",
      renderIcon: (isFocused: boolean) => (
        <ClipboardList
          className={`w-6 h-6 stroke-white ${
            isFocused ? "stroke-primary" : "stroke-white"
          }`}
        />
      ),
    },
    {
      name: "profile",
      label: "Profile",
      href: "/profile",
      renderIcon: (isFocused: boolean) => (
        <UserRound
          className={`w-6 h-6 stroke-white ${
            isFocused ? "stroke-primary" : "stroke-white"
          }`}
        />
      ),
    },
  ];

  return (
    <Authenticated>
      <SafeAreaProvider>
        <Tabs>
          <TabSlot />
          <TabList className="h-20 px-9 absolute bottom-6 left-6 right-6 bg-black rounded-3xl items-center justify-center border border-white/10 shadow-lg shadow-black/50">
            {tabs.map((tab) => (
              <TabTrigger
                name={tab.name}
                href={tab.href as Href}
                asChild
                key={tab.name}
              >
                <TabBarButton
                  renderIcon={({ isFocused }) => tab.renderIcon(isFocused)}
                >
                  {tab.label}
                </TabBarButton>
              </TabTrigger>
            ))}
          </TabList>
        </Tabs>
      </SafeAreaProvider>
    </Authenticated>
  );
}
