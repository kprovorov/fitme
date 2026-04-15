import { PortalHost } from "@rn-primitives/portal";
import { Stack, useRouter } from "expo-router";
import { HeaderBackButton } from "~/components/ui/header-back-button";

export default function Layout() {
  const _router = useRouter();

  return (
    <>
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerTitle: "",
          headerLeft: () => <HeaderBackButton />,
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
