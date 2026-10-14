import Constants from "expo-constants";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import UpdateRequiredView from "~/components/views/update-required-view";
import {
  type ClientConfig,
  useClientConfigQuery,
} from "~/hooks/queries/client-config";
import { isBelowMinimumVersion } from "~/lib/app-version";
import { getApiUrl } from "~/lib/constants";

const minimumVersionForPlatform = (config: ClientConfig | undefined) => {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    return config?.minimumVersion[Platform.OS] ?? null;
  }
  return null;
};

/**
 * Replaces the whole app with the "Update required" screen when this build is
 * older than the minimum version `apps/api` reports. Checks on launch and on
 * every return to the foreground. Until a check succeeds (offline, API down,
 * no `EXPO_PUBLIC_API_URL`) the app runs as normal.
 */
export default function MinimumVersionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasApi = getApiUrl() !== "";
  const { data, refetch } = useClientConfigQuery({ enabled: hasApi });

  useEffect(() => {
    if (!hasApi) {
      return;
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refetch();
      }
    });
    return () => subscription.remove();
  }, [hasApi, refetch]);

  if (
    isBelowMinimumVersion(
      Constants.expoConfig?.version,
      minimumVersionForPlatform(data)
    )
  ) {
    return <UpdateRequiredView />;
  }

  return children;
}
