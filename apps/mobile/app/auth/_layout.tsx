import { useAuth } from "@clerk/expo";
import { Redirect, Stack, usePathname } from "expo-router";
import { useLayoutEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { invalidateAuthOperation } from "~/components/auth/operation";

export const unstable_settings = { initialRouteName: "index" };

const Layout = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  // SAFETY: The imported design tokens define --color-foreground as a hex color string.
  const foreground = useCSSVariable("--color-foreground") as string;
  useLayoutEffect(() => {
    invalidateAuthOperation(pathname);

    return () => invalidateAuthOperation();
  }, [pathname]);

  if (!isLoaded) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator colorClassName="accent-foreground" />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: "minimal",
        headerShown: true,
        headerTintColor: foreground,
        headerTitle: "",
        headerTransparent: true,
      }}
    />
  );
};

export default Layout;
