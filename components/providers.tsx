import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { AnalyticsProvider } from "@segment/analytics-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { Platform, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { useSyncQueriesExternal } from "react-query-external-sync";
import { useColorScheme } from "@/hooks/useColorScheme";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";

const queryClient = new QueryClient();

function DevToolsSync() {
  useSyncQueriesExternal({
    queryClient,
    socketURL: "http://localhost:42831", // Default port for React Native DevTools
    deviceName: Platform?.OS || "web", // Platform detection
    platform: Platform?.OS || "web", // Use appropriate platform identifier
    deviceId: Platform?.OS || "web", // Use a PERSISTENT identifier (see note below)
    enableLogs: false,
    envVariables: {
      NODE_ENV: process.env.NODE_ENV,
      // Add any private environment variables you want to monitor
      // Public environment variables are automatically loaded
    },
    // Storage monitoring with CRUD operations
    mmkvStorage: storage, // MMKV storage for ['#storage', 'mmkv', 'key'] queries + monitoring
    asyncStorage: AsyncStorage, // AsyncStorage for ['#storage', 'async', 'key'] queries + monitoring
    secureStorage: SecureStore, // SecureStore for ['#storage', 'secure', 'key'] queries + monitoring
    secureStorageKeys: ["biometricKey", "deviceId"], // SecureStore keys to monitor
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
            <QueryClientProvider client={queryClient}>
              <DevToolsSync />
              <ThemeProvider
                value={
                  colorScheme === "dark"
                    ? {
                        ...DarkTheme,
                        colors: {
                          ...DarkTheme.colors,
                          primary: "#C0FF38",
                          background: "#1F1D20",
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
