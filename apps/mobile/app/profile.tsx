import { useUser } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView } from "react-native";
import Purchases from "react-native-purchases";

import ProfileRedesignView from "~/components/profile/profile-redesign-view";
import ProfileView from "~/components/views/profile-view";
import { useActivePlanQuery } from "~/hooks/queries/plans";
import {
  LIFETIME_TOTALS_QUERY_KEY,
  OPEN_WORKOUT_SESSION_QUERY_KEY,
} from "~/hooks/queries/workout-sessions";
import { isProfileRedesignEnabled } from "~/lib/feature-flags";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

// Pushed over the tabs from the first tab's header button.
const ProfileScreen = () => {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useUser();
  const isRedesign = isProfileRedesignEnabled();

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
      // The Lifetime totals, and the reads the New user state's button
      // rests on: none is retried, so a failed one recovers here.
      queryClient.refetchQueries({ queryKey: LIFETIME_TOTALS_QUERY_KEY }),
      queryClient.refetchQueries({
        queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
      }),
      queryClient.refetchQueries({ queryKey: useActivePlanQuery.getKey() }),
    ]);
    setRefreshing(false);
  }, [queryClient, user]);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: t("profile.title"),
        }}
      />
      <ScrollView
        className={isRedesign ? "px-sm" : "p-6"}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
        testID="profile-scroll"
      >
        {isRedesign ? <ProfileRedesignView /> : <ProfileView />}
      </ScrollView>
    </>
  );
};

export default ProfileScreen;
