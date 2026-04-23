import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";

export default function Layout() {
  return (
    <>
      <Stack
        screenOptions={{
          // headerShown: false,
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <PortalHost />
    </>
  );
}
