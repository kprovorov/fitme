import { ClerkProvider } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AnalyticsProvider } from "@segment/analytics-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import * as SecureStore from "expo-secure-store";
import { Platform, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { useSyncQueriesExternal } from "react-query-external-sync";
import AuthSync from "@/components/auth-sync";
import { useColorScheme } from "@/hooks/useColorScheme";
import { clerkPublishableKey, tokenCache } from "~/lib/clerk";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";

const queryClient = new QueryClient();

function DevToolsSync() {
  useSyncQueriesExternal({
    asyncStorage: AsyncStorage, // AsyncStorage for ['#storage', 'async', 'key'] queries + monitoring
    deviceId: Platform.OS, // Use a PERSISTENT identifier (see note below)
    deviceName: Platform.OS, // Platform detection
    enableLogs: false,
    envVariables: {
      NODE_ENV: process.env.NODE_ENV,
      // Add any private environment variables you want to monitor
      // Public environment variables are automatically loaded
    },
    // Storage monitoring with CRUD operations
    mmkvStorage: storage, // MMKV storage for ['#storage', 'mmkv', 'key'] queries + monitoring
    platform: Platform.OS, // Use appropriate platform identifier
    queryClient,
    secureStorage: SecureStore, // SecureStore for ['#storage', 'secure', 'key'] queries + monitoring
    secureStorageKeys: ["biometricKey", "deviceId"], // SecureStore keys to monitor
    socketURL: "http://localhost:42831", // Default port for React Native DevTools
  });

  return null;
}

function Providers({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GestureHandlerRootView style={styles.root}>
        <KeyboardProvider statusBarTranslucent>
          <AnalyticsProvider client={segmentClient}>
            <ClerkProvider
              publishableKey={clerkPublishableKey}
              tokenCache={tokenCache}
            >
              <QueryClientProvider client={queryClient}>
                <DevToolsSync />
                <AuthSync />
                <ThemeProvider
                  value={
                    colorScheme === "dark"
                      ? {
                          ...DarkTheme,
                          colors: {
                            ...DarkTheme.colors,
                            background: "#1F1D20",
                            primary: "#C0FF38",
                          },
                        }
                      : {
                          ...DefaultTheme,
                          colors: {
                            ...DefaultTheme.colors,
                            primary: "#C0FF38",
                          },
                        }
                  }
                >
                  {children}
                </ThemeProvider>
              </QueryClientProvider>
            </ClerkProvider>
          </AnalyticsProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default Providers;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
