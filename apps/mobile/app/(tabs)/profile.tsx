import { useUser } from "@clerk/expo";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import Purchases from "react-native-purchases";
import ProfileView from "~/components/views/profile-view";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

import { useQueryClient } from "@tanstack/react-query";

export default function ProfileScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useUser();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (!IS_E2E) {
      await Purchases.invalidateCustomerInfoCache();
    }
    await Promise.all([
      user?.reload(),
      queryClient.refetchQueries({
        queryKey: ["profile"],
      }),
      queryClient.refetchQueries({
        queryKey: ["rc-is-pro"],
      }),
      queryClient.refetchQueries({
        queryKey: ["rc-customer-info"],
      }),
    ]);
    setRefreshing(false);
  }, [queryClient.refetchQueries, user]);

  return (
    <ScrollView
      className="p-6"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
      }
    >
      <ProfileView />
    </ScrollView>
  );
}
