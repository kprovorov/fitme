import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";

export default function Layout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerTitle: "",
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="preview" />
      </Stack>
      <PortalHost />
    </>
  );
}
