import { useCallback, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import Purchases from "react-native-purchases";
import { SafeAreaView } from "react-native-safe-area-context";
import ProfileView from "~/components/views/profile-view";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

import { useQueryClient } from "@tanstack/react-query";

export default function ProfileScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (!IS_E2E) {
      await Purchases.invalidateCustomerInfoCache();
    }
    await Promise.all([
      queryClient.refetchQueries({
        queryKey: ["user"],
      }),
      queryClient.refetchQueries({
        queryKey: ["rc-is-pro"],
      }),
      queryClient.refetchQueries({
        queryKey: ["rc-customer-info"],
      }),
    ]);
    setRefreshing(false);
  }, [queryClient.refetchQueries]);

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <ScrollView
        className="p-6"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
      >
        <ProfileView />
      </ScrollView>
    </SafeAreaView>
  );
}
