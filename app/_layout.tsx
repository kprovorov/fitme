import { getToken } from "@/lib/api";
import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from "@expo-google-fonts/nunito-sans";
import { PortalHost } from "@rn-primitives/portal";
import * as Sentry from "@sentry/react-native";
import { QueryClient } from "@tanstack/react-query";
import "expo-dev-client";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import "react-native-reanimated";
import App from "~/components/app";
import Providers from "~/components/providers";
import "../global.css";

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

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      getToken();

      Purchases.addCustomerInfoUpdateListener(async (info) => {
        await queryClient.invalidateQueries({
          queryKey: ["rc-is-pro"],
        });
      });
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  if (Platform.OS === "ios") {
    Purchases.configure({
      apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY!,
    });
  } else if (Platform.OS === "android") {
    Purchases.configure({
      apiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY!,
    });
  }

  return (
    <Providers>
      <App />
      <PortalHost />
      <StatusBar style="auto" />
    </Providers>
  );
}
