import "../global.css";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import { useColorScheme } from "@/hooks/useColorScheme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getToken } from "@/lib/api";
import { PortalHost } from "@rn-primitives/portal";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      getToken();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);

  if (Platform.OS === "ios") {
    Purchases.configure({ apiKey: "appl_tyPiVjUPLKRkYyFsRwPEoqXUmHR" });
  } else if (Platform.OS === "android") {
    Purchases.configure({ apiKey: "google_api_key" });
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        value={
          colorScheme === "dark"
            ? {
                ...DarkTheme,
                colors: { ...DarkTheme.colors, background: "#434343" },
              }
            : DefaultTheme
        }
      >
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="auth/login"
            options={{
              presentation: "fullScreenModal",
              title: "Login",
              headerShown: false,
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <PortalHost />
        <StatusBar style="auto" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
