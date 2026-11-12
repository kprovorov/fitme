/* oxlint-disable import/no-duplicates -- Install synchronous polyfills, then initialize translations before routes or components. */
import "@/polyfills";
import "~/lib/i18n";
import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from "@expo-google-fonts/nunito-sans";
import { scrubEvent, tracePropagationTargets } from "@fitme/observability";
import { PortalHost } from "@rn-primitives/portal";
import * as Sentry from "@sentry/react-native";
import { useFonts } from "expo-font";
import "expo-dev-client";
import { Stack } from "expo-router";
import { getFocusedRouteNameFromRoute } from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import "react-native-reanimated";
import Purchases from "react-native-purchases";
import { Uniwind } from "uniwind";

import MinimumVersionGate from "~/components/minimum-version-gate";
import Providers from "~/components/providers";

import "../global.css";
import { PlanUpdateSheetHost } from "~/components/workout-sessions/plan-update-sheet";
import { SCROLL_EDGE_EFFECTS } from "~/lib/constants";
// Starts the translations in the App language before anything renders.
import { useAppLanguageSync } from "~/lib/i18n";
import { isTracedRequestUrl, templateRequestSpans } from "~/lib/request-spans";
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
  // The route templates first, then the shared scrubber, which stays the
  // `beforeSendTransaction` (so it also backstops what a span carries).
  beforeSendTransaction: (event) => scrubEvent(templateRequestSpans(event)),
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Development builds (simulator, Expo Go, dev clients) send nothing.
  enabled: !__DEV__,
  integrations: [
    // Replaces the default `ReactNativeTracing` by name, to record an
    // `http.client` span per request (the phone-side latency of the Public API
    // and the Library API). `traceFetch` is the SDK's own default here
    // (expo/fetch bypasses XHR), set so a change of that default can't
    // silently stop the spans; `shouldCreateSpanForRequest` keeps the spans to
    // the hosts we send trace headers to, so a span and its request always
    // share a trace and Clerk, RevenueCat, Supabase and Segment get neither.
    Sentry.reactNativeTracingIntegration({
      shouldCreateSpanForRequest: isTracedRequestUrl,
      traceFetch: true,
    }),
  ],
  // Relative to tracesSampleRate: half of the traced sessions are profiled.
  profilesSampleRate: 0.5,
  // oxlint-disable-next-line typescript/no-deprecated -- Keep the explicit privacy opt-out alongside the shared data-collection policy.
  sendDefaultPii: false,
  // Trace headers go to our own services only (api, app, arnold, library, mcp,
  // webhooks), never to Clerk, RevenueCat, Supabase or Segment.
  tracePropagationTargets,
  tracesSampleRate: 0.1,
});

// The app is dark only (ADR 0009). Native builds are already forced dark by
// `userInterfaceStyle`, but web follows the OS, so pin uniwind to the dark
// theme on every platform and `dark:` variants always apply.
Uniwind.setTheme("dark");

// Prevent the splash screen from auto-hiding before asset loading is complete.
void SplashScreen.preventAutoHideAsync();

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

const RootLayout = () => {
  useAppLanguageSync();
  // Re-renders on a language change, so the back button titles follow it.
  useTranslation();

  const [loaded] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
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
            name="plans/create"
            // The header is on from the start: turning it on from inside the
            // Screen (its own Stack.Screen) remounts the modal's content and
            // loses its step (FIT-628).
            options={{
              headerShown: true,
              headerTransparent: true,
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="plans/[planId]/edit"
            options={{
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="workout-sessions/[workoutSessionId]/exercise-picker"
            options={{
              headerShown: true,
              presentation: "pageSheet",
            }}
          />
          <Stack.Screen
            name="muscles"
            options={{
              headerShown: true,
              headerTransparent: true,
              presentation: "formSheet",
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true,
              sheetInitialDetentIndex: 0,
            }}
          />
          <Stack.Screen
            name="equipment"
            options={{
              headerShown: true,
              headerTransparent: true,
              presentation: "formSheet",
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true,
              sheetInitialDetentIndex: 0,
            }}
          />
          <Stack.Screen
            name="exercises/[exerciseSlug]/guide"
            // Its header is on from the start, like the Create Plan modal's
            // (FIT-628), so the sheet doesn't remount turning it on.
            options={{
              headerShown: true,
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
      <StatusBar />
    </Providers>
  );
};

// Captures render crashes and touch breadcrumbs, and traces app start.
export default Sentry.wrap(RootLayout);
