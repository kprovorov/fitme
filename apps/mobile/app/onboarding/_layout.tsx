import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";

export default function Layout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: "minimal",
          headerTitle: "",
          headerTransparent: true,
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
