import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { SCROLL_EDGE_EFFECTS } from "~/lib/constants";

export default function Layout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: "minimal",
          headerTitle: "",
          headerTransparent: true,
          scrollEdgeEffects: SCROLL_EDGE_EFFECTS,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
      </Stack>
      <PortalHost />
    </>
  );
}
