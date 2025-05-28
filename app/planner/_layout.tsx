import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import React from "react";
import { HeaderBackButton } from "~/components/ui/header-back-button";

export default function Layout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerTitle: "",
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          headerLeft: () => <HeaderBackButton />,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="preview" />
      </Stack>
      <PortalHost />
    </>
  );
}
