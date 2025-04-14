import { PortalHost } from "@rn-primitives/portal";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { ArrowLeft } from "~/lib/icons/ArrowLeft";

export default function Layout() {
  const router = useRouter();

  return (
    <>
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerTitle: "",
          headerLeft: () => (
            <Button
              variant="secondary"
              size="icon-sm"
              onPress={() => router.dismiss()}
              className="rounded-full"
            >
              <HStack className="gap-1">
                <ArrowLeft size={16} className="text-white" />
              </HStack>
            </Button>
          ),
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
