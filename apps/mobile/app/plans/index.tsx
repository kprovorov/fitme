import { Stack, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView } from "react-native";

import { MyPlansView } from "~/components/views/my-plans-view";
import PlansListView from "~/components/views/plan-list-view";
import { usePlanSummariesQuery } from "~/hooks/queries/plans";
import { isPlansRedesignEnabled } from "~/lib/feature-flags";

/** The native header: the title and a "+" opening Create Plan. */
const PlansHeader = () => {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Stack.Screen
      options={{
        headerBackButtonDisplayMode: "minimal",
        headerShown: true,
        headerTitleStyle: {
          fontFamily: "NunitoSans-Bold",
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
  );
};

/** Today's Plans list, while the Plans redesign flag is off. */
const LegacyPlansScreen = () => {
  const { refetch, isLoading } = usePlanSummariesQuery();

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <>
      <PlansHeader />

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

/**
 * My Plans with the Plans redesign: the active Plan's hero card, the other
 * Plans as rows, and a designed state for loading, no Plans and a failed
 * read. Pulling to refresh shows its own spinner, never the skeleton.
 */
const MyPlansScreen = () => {
  const { data: plans, error, refetch } = usePlanSummariesQuery();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // react-query's refetch never rejects: a failure lands in the query.
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <>
      <PlansHeader />

      <ScrollView
        contentContainerClassName="grow px-sm pb-lg"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={isRefreshing} />
        }
        testID="plans-screen"
      >
        <MyPlansView error={error} onRetry={retry} plans={plans} />
      </ScrollView>
    </>
  );
};

const PlansScreen = () =>
  isPlansRedesignEnabled() ? <MyPlansScreen /> : <LegacyPlansScreen />;

export default PlansScreen;
