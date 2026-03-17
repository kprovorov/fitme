import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VStack } from "~/components/ui/vstack";
import ProfileView from "~/components/views/profile-view";
import Purchases from "react-native-purchases";
import { useQueryClient } from "@tanstack/react-query";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

export default function ProfileScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (!IS_E2E) await Purchases.invalidateCustomerInfoCache();
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
  }, []);

  return (
    <SafeAreaView
      edges={["top"]}
      style={{
        paddingBottom: 64,
      }}
      className="flex-1"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="p-6 flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <VStack
          className="items-stretch flex-1 min-h-full justify-between gap-0"
          style={{ paddingBottom: 64 }}
        >
          <ProfileView />
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
