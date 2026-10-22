import "@/polyfills";
import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from "@expo-google-fonts/nunito-sans";
import { scrubEvent, tracePropagationTargets } from "@fitme/observability";
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
import { Uniwind } from "uniwind";
import MinimumVersionGate from "~/components/minimum-version-gate";
import Providers from "~/components/providers";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
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

// React Native's global: true in development builds.
declare const __DEV__: boolean;

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

Sentry.init({
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Development builds (simulator, Expo Go, dev clients) send nothing.
  enabled: !__DEV__,
  // Relative to tracesSampleRate: half of the traced sessions are profiled.
  profilesSampleRate: 0.5,
  sendDefaultPii: false,
  // Trace headers go to our own services only (api, coach, exercises, mcp…),
  // never to Clerk, RevenueCat, Supabase or Segment.
  tracePropagationTargets,
  tracesSampleRate: 0.1,
});

// The app is dark only (ADR 0009). Native builds are already forced dark by
// `userInterfaceStyle`, but web follows the OS, so pin uniwind to the dark
// theme on every platform and `dark:` variants always apply.
Uniwind.setTheme("dark");

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

function RootLayout() {
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
            name="exercises/[exerciseSlug]/guide"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true,
              sheetInitialDetentIndex: 0,
            }}
          />
        </Stack>
      </MinimumVersionGate>
      <PlanUpdateSheetHost />
      <PortalHost />
      <StatusBar style="auto" />
    </Providers>
  );
}

// Captures render crashes and touch breadcrumbs, and traces app start.
export default Sentry.wrap(RootLayout);
