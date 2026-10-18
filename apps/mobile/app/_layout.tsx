import "@/polyfills";
import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from "@expo-google-fonts/nunito-sans";
import { PortalHost } from "@rn-primitives/portal";
import * as Sentry from "@sentry/react-native";
import "expo-dev-client";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import "react-native-reanimated";
import MinimumVersionGate from "~/components/minimum-version-gate";
import Providers from "~/components/providers";
import "../global.css";
import { Stack } from "expo-router";
import { getFocusedRouteNameFromRoute } from "expo-router/react-navigation";
import { SCROLL_EDGE_EFFECTS } from "~/lib/constants";
import { getTabTitle } from "~/lib/tabs";

// Back buttons over the tabs name the focused tab (see `getTabTitle`).
const tabsScreenOptions = ({
  route,
}: {
  route: Parameters<typeof getFocusedRouteNameFromRoute>[0];
}) => ({
  title: getTabTitle(getFocusedRouteNameFromRoute(route)),
});

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // profilesSampleRate is relative to tracesSampleRate.
  // Here, we'll capture profiles for 100% of transactions.
  profilesSampleRate: 0.5,
  // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
  // We recommend adjusting this value in production.
  // Learn more at
  // https://docs.sentry.io/platforms/javascript/configuration/options/#traces-sample-rate
  tracesSampleRate: 0.1,
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Configured before anything renders, so the signed-in User can be logged in
// to RevenueCat as soon as Clerk loads.
if (!IS_E2E) {
  const revenueCatApiKey = Platform.select({
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    web: process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY,
  });
  Purchases.configure({ apiKey: revenueCatApiKey ?? "" });
}

export default function RootLayout() {
  const [loaded] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <Providers>
      <MinimumVersionGate>
        <Stack
          screenOptions={{
            headerShown: false,
            scrollEdgeEffects: SCROLL_EDGE_EFFECTS,
          }}
        >
          <Stack.Screen name="(tabs)" options={tabsScreenOptions} />
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
          <Stack.Screen
            name="exercises/[exerciseId]/guide"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true,
              sheetInitialDetentIndex: 0,
            }}
          />
        </Stack>
      </MinimumVersionGate>
      <PortalHost />
      <StatusBar style="auto" />
    </Providers>
  );
}
