import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";

export default function Layout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerTitle: "",
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="plan" />
        <Stack.Screen name="profile" />
      </Stack>
      <PortalHost />
    </>
  );
}
