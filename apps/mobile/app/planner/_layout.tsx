import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";

export default function Layout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: "minimal",
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          // headerShown: false,
          headerTransparent: true,
        }}
      />
      <PortalHost />
    </>
  );
}
