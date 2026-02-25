import { useColorScheme } from "@/hooks/useColorScheme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useSyncQueriesExternal } from "react-query-external-sync";
import { storage } from "~/lib/mmkv";

const queryClient = new QueryClient();

function Providers({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();

  // Set up the sync hook - automatically disabled in production!
  useSyncQueriesExternal({
    queryClient,
    socketURL: "http://localhost:42831", // Default port for React Native DevTools
    deviceName: Platform?.OS || "web", // Platform detection
    platform: Platform?.OS || "web", // Use appropriate platform identifier
    deviceId: Platform?.OS || "web", // Use a PERSISTENT identifier (see note below)
    extraDeviceInfo: {
      // Optional additional info about your device
      appVersion: "1.0.0",
      // Add any relevant platform info
    },
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

  return (
    <QueryClientProvider client={queryClient}>
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
        <KeyboardProvider>{children}</KeyboardProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default Providers;
