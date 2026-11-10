import { Stack, useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView } from "react-native";

import PlansListView from "~/components/views/plan-list-view";
import { usePlanSummariesQuery } from "~/hooks/queries/plans";

const PlansScreen = () => {
  const { refetch, isLoading } = usePlanSummariesQuery();
  const router = useRouter();
  const { t } = useTranslation();

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: t("plans.title"),
          unstable_headerRightItems: () => [
            {
              icon: {
                name: "plus",
                type: "sfSymbol",
              },
              label: t("plans.create"),
              onPress: () => {
                router.push("/plans/create");
              },
              type: "button",
            },
          ],
        }}
      />

      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={isLoading} />
        }
        testID="plans-screen"
      >
        <PlansListView />
      </ScrollView>
    </>
  );
};

export default PlansScreen;
