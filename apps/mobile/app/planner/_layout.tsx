import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { SCROLL_EDGE_EFFECTS } from "~/lib/constants";

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
          scrollEdgeEffects: SCROLL_EDGE_EFFECTS,
        }}
      />
      <PortalHost />
    </>
  );
}
