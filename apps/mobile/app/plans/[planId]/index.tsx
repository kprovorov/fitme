import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import WorkoutList from "~/components/views/workout-list";
import {
  PLANS_QUERY_KEY,
  useActivatePlanMutation,
  useDeletePlanMutation,
  usePlanQuery,
} from "~/hooks/queries/plans";
import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";
import { OPEN_WORKOUT_SESSION_QUERY_KEY } from "~/hooks/queries/workout-sessions";

/**
 * What to tell the User after a failed Plan write. A failure other than a 404
 * or a 429 doesn't prove nothing changed (the answer can be lost after the
 * write commits), so it never says either way.
 */
const failureMessage = (t: TFunction, error: ApiError | null) => {
  if (error?.code === "not_found") {
    return t("plans.errors.notFound");
  }

  const waitSeconds = rateLimitedFor(error);

  return waitSeconds === null
    ? t("plans.errors.network")
    : t("plans.errors.rateLimited", { seconds: waitSeconds });
};

const PlanScreen = () => {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { t } = useTranslation();

  // A failed call doesn't prove nothing changed, so the Plans are read again
  // (a successful activation shows its answer: the mutation does that).
  const refreshPlans = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["plan"] });
    // Activating or deleting the active Plan changes the Weekly goal
    queryClient.invalidateQueries({ queryKey: WEEKLY_GOALS_QUERY_KEY });
  }, [queryClient]);

  // No hook-level `onSuccess`: it would replace the mutation's own, which
  // shows the activated Plan from the answer.
  const { mutate: activatePlan } = useActivatePlanMutation({
    onError: (error) => {
      Alert.alert(
        t("plans.activate.failed"),
        failureMessage(t, error instanceof ApiError ? error : null)
      );
      refreshPlans();
    },
  });

  const activate = useCallback(() => {
    activatePlan(
      { id: planId },
      {
        onSuccess: () => {
          router.dismissTo("/");
        },
      }
    );
  }, [activatePlan, planId, router]);

  const { mutate: deletePlan } = useDeletePlanMutation({
    onError: (error) => {
      Alert.alert(
        t("plans.archive.failed"),
        failureMessage(t, error instanceof ApiError ? error : null)
      );
    },
    onSettled: refreshPlans,
    onSuccess: () => {
      router.dismissTo("/");
    },
  });

  // `null` once the Plan is gone (deleted, or never the User's). A failed
  // refresh keeps the Plan read last.
  const {
    data: plan,
    error: readError,
    isError,
    isLoading,
    refetch,
  } = usePlanQuery({ variables: { id: planId } });

  // Each Workout card's open session (and its timer) comes from the open
  // Workout Session's own read, which a pull refreshes too (when a card reads
  // it): with none open it isn't polled, so a session started elsewhere, or
  // a first read that failed, shows only once read again.
  const onRefresh = useCallback(async () => {
    await Promise.all([
      refetch(),
      queryClient.refetchQueries({ queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY }),
    ]);
  }, [refetch, queryClient]);

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.dismissTo("/");
    }
  }, [router]);

  const renderContent = () => {
    if (plan) {
      return (
        <VStack className="flex-1 items-stretch">
          <WorkoutList planId={plan.id} workouts={plan.workouts} />
        </VStack>
      );
    }

    if (plan === null) {
      return (
        <View className="gap-sm pt-lg items-center">
          <Text className="text-center" variant="muted">
            {t("plans.errors.notFound")}
          </Text>
          <Button
            fill={false}
            label={t("plans.goBack")}
            onPress={goBack}
            variant="secondary"
          />
        </View>
      );
    }

    if (isError) {
      const waitSeconds = rateLimitedFor(readError);

      return (
        <View className="gap-sm pt-lg items-center">
          <Text className="text-center" variant="muted">
            {waitSeconds === null
              ? t("plans.loadError")
              : t("common.rateLimited", { seconds: waitSeconds })}
          </Text>
          <Button
            fill={false}
            label={t("common.tryAgain")}
            onPress={retry}
            variant="secondary"
          />
        </View>
      );
    }

    return (
      <View className="pt-lg items-center" testID="plan-loading">
        <ActivityIndicator colorClassName="accent-foreground" />
      </View>
    );
  };

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
          title: plan?.name ?? "",
          // Its actions need the Plan: whether it's active decides Archive.
          unstable_headerRightItems: () =>
            plan
              ? [
                  {
                    icon: {
                      name: "ellipsis",
                      type: "sfSymbol",
                    },
                    label: t("plans.manage"),
                    menu: {
                      items: [
                        {
                          icon: {
                            name: "square.and.pencil",
                            type: "sfSymbol",
                          },
                          label: t("plans.edit"),
                          onPress: () => {
                            router.push({
                              params: { planId },
                              pathname: "/plans/[planId]/edit",
                            });
                          },
                          type: "action",
                        },
                        {
                          icon: {
                            name: "bolt",
                            type: "sfSymbol",
                          },
                          label: t("plans.activate.action"),
                          onPress: () => {
                            Alert.alert(
                              t("plans.activate.title"),
                              t("plans.activate.message"),
                              [
                                { style: "cancel", text: t("common.cancel") },
                                {
                                  onPress: activate,
                                  text: t("plans.activate.confirm"),
                                },
                              ]
                            );
                          },
                          type: "action",
                        },
                        {
                          destructive: true,
                          icon: {
                            name: "trash",
                            type: "sfSymbol",
                          },
                          label: t("plans.archive.action"),
                          onPress: () => {
                            if (plan.is_active) {
                              Alert.alert(
                                t("plans.archive.title"),
                                t("plans.archive.activePlan")
                              );
                            } else {
                              Alert.alert(
                                t("plans.archive.title"),
                                t("plans.archive.message"),
                                [
                                  { style: "cancel", text: t("common.cancel") },
                                  {
                                    onPress: () => deletePlan({ id: planId }),
                                    style: "destructive",
                                    text: t("plans.archive.confirm"),
                                  },
                                ]
                              );
                            }
                          },
                          type: "action",
                        },
                      ],
                    },
                    type: "menu",
                  },
                ]
              : [],
        }}
      />
      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={isLoading} />
        }
        testID="plan-screen"
      >
        {renderContent()}
      </ScrollView>
    </>
  );
};

export default PlanScreen;
