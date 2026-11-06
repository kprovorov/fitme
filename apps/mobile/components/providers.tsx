import { ClerkProvider } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AnalyticsProvider } from "@segment/analytics-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "expo-router/react-navigation";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { useSyncQueriesExternal } from "react-query-external-sync";

import AuthSync from "@/components/auth-sync";
import { useNavigationTheme } from "~/hooks/navigation-theme";
import { clerkPublishableKey, tokenCache } from "~/lib/clerk";
import { isDevToolsSyncEnabled } from "~/lib/constants";
import { devToolsStorage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";

const queryClient = new QueryClient();

const DevToolsSync = () => {
  useSyncQueriesExternal({
    // AsyncStorage for ['#storage', 'async', 'key'] queries + monitoring
    asyncStorage: AsyncStorage,
    deviceId: Platform.OS,
    // Platform detection
    deviceName: Platform.OS,
    enableLogs: false,
    envVariables: {
      NODE_ENV: process.env.NODE_ENV,
      // Add any private environment variables you want to monitor
      // Public environment variables are automatically loaded
    },
    // Storage monitoring with CRUD operations
    // MMKV storage for ['#storage', 'mmkv', 'key'] queries + monitoring
    mmkvStorage: devToolsStorage,
    // Use appropriate platform identifier
    platform: Platform.OS,
    queryClient,
    // SecureStore for ['#storage', 'secure', 'key'] queries + monitoring
    secureStorage: SecureStore,
    // SecureStore keys to monitor
    secureStorageKeys: ["biometricKey", "deviceId"],
    // Default port for React Native DevTools
    socketURL: "http://localhost:42831",
  });

  return null;
};

const Providers = ({ children }: { children: React.ReactNode }) => {
  const navigationTheme = useNavigationTheme();

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GestureHandlerRootView>
        <KeyboardProvider statusBarTranslucent>
          <AnalyticsProvider client={segmentClient}>
            <ClerkProvider
              publishableKey={clerkPublishableKey}
              tokenCache={tokenCache}
            >
              <QueryClientProvider client={queryClient}>
                {isDevToolsSyncEnabled() ? <DevToolsSync /> : null}
                <AuthSync />
                <ThemeProvider value={navigationTheme}>
                  {children}
                </ThemeProvider>
              </QueryClientProvider>
            </ClerkProvider>
          </AnalyticsProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

export default Providers;
