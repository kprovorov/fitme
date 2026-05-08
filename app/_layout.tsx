import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from "@expo-google-fonts/nunito-sans";
import { PortalHost } from "@rn-primitives/portal";
import * as Sentry from "@sentry/react-native";
import { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import "expo-dev-client";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import "react-native-reanimated";
import Providers from "~/components/providers";
import "../global.css";
import { Stack } from "expo-router";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
  // We recommend adjusting this value in production.
  // Learn more at
  // https://docs.sentry.io/platforms/javascript/configuration/options/#traces-sample-rate
  tracesSampleRate: 0.1,
  // profilesSampleRate is relative to tracesSampleRate.
  // Here, we'll capture profiles for 100% of transactions.
  profilesSampleRate: 0.5,
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const [loaded] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Refactor later
  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();

      if (!IS_E2E) {
        if (Platform.OS === "web") {
          Purchases.configure({
            apiKey: process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY ?? "",
          });
        } else if (Platform.OS === "ios") {
          Purchases.configure({
            apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "",
          });
        } else if (Platform.OS === "android") {
          Purchases.configure({
            apiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "",
          });
        }
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          queryClient.invalidateQueries({ queryKey: ["user"] });
          if (!IS_E2E && session?.user?.id) {
            await Purchases.logIn(session.user.id);
            queryClient.invalidateQueries({ queryKey: ["rc-is-pro"] });
          }
        }
        if (event === "SIGNED_OUT") {
          if (!IS_E2E) {
            await Purchases.logOut();
          }
          queryClient.clear();
        }
      });

      if (!IS_E2E) {
        Purchases.addCustomerInfoUpdateListener(async () => {
          await queryClient.invalidateQueries({
            queryKey: ["rc-is-pro"],
          });
        });
      }

      return () => subscription.unsubscribe();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <Providers>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ title: "Home" }} />
        <Stack.Screen
          name="onboarding"
          options={{
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="planner"
          options={{
            presentation: "modal",
          }}
        />
      </Stack>
      <PortalHost />
      <StatusBar style="auto" />
    </Providers>
  );
}
