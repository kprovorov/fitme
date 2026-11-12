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
  // SAFETY: The imported design tokens define --color-background as a hex color string.
  const background = useCSSVariable("--color-background") as string;
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
        // An opaque header in the Screen's own color: a form scrolled up
        // goes under it rather than under the floating back button.
        headerShadowVisible: false,
        headerStyle: { backgroundColor: background },
        headerTintColor: foreground,
        headerTitle: "",
      }}
    />
  );
};

export default Layout;
