import { rateLimitedFor } from "@fitme/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LayoutChangeEvent } from "react-native";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScopedVariables } from "uniwind";

import { ExerciseUnavailable } from "~/components/exercises/exercise-unavailable";
import PlanDetailView, {
  PlanDetailSkeleton,
} from "~/components/plans/plan-detail-view";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import WorkoutList from "~/components/views/workout-list";
import { planWriteFailureMessage, usePlanActions } from "~/hooks/plan-actions";
import {
  PLANS_QUERY_KEY,
  useActivatePlanMutation,
  useDeletePlanMutation,
  usePlanQuery,
  usePlanSummariesQuery,
} from "~/hooks/queries/plans";
import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";
import { OPEN_WORKOUT_SESSION_QUERY_KEY } from "~/hooks/queries/workout-sessions";
import { isPlansRedesignEnabled } from "~/lib/feature-flags";

/** Today's Plan screen, while the Plans redesign flag is off. */
const LegacyPlanScreen = () => {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { t } = useTranslation();

  // A failed call doesn't prove nothing changed, so the Plans are read again
  // (a successful activation shows its answer: the mutation does that).
  const refreshPlans = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
    // Activating or deleting the active Plan changes the Weekly goal
    void queryClient.invalidateQueries({ queryKey: WEEKLY_GOALS_QUERY_KEY });
  }, [queryClient]);

  // No hook-level `onSuccess`: it would replace the mutation's own, which
  // shows the activated Plan from the answer.
  const { mutate: activatePlan } = useActivatePlanMutation({
    onError: (error) => {
      Alert.alert(
        t("plans.activate.failed"),
        planWriteFailureMessage(t, error)
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
      Alert.alert(t("plans.archive.failed"), planWriteFailureMessage(t, error));
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
    void refetch();
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
            size="lg"
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
            size="lg"
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
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: plan?.name ?? "",
          // Its actions need the Plan: whether it's active decides Activate and
          // Archive.
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
                        // The active Plan has nothing to activate.
                        ...(plan.is_active
                          ? []
                          : [
                              {
                                icon: {
                                  name: "bolt",
                                  type: "sfSymbol",
                                } as const,
                                label: t("plans.activate.action"),
                                onPress: () => {
                                  Alert.alert(
                                    t("plans.activate.title"),
                                    t("plans.activate.message"),
                                    [
                                      {
                                        style: "cancel",
                                        text: t("common.cancel"),
                                      },
                                      {
                                        onPress: activate,
                                        text: t("plans.activate.confirm"),
                                      },
                                    ]
                                  );
                                },
                                type: "action" as const,
                              },
                            ]),
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

/** Space between the pinned Activate Plan and the bottom safe area. */
const BOTTOM_GAP = 16;

/** The bottom edge fades under the pinned Activate Plan. */
const PINNED_SCROLL_EDGE_EFFECTS = {
  bottom: "soft",
  left: "automatic",
  right: "automatic",
  top: "automatic",
} as const;

/**
 * The Plan screen, redesigned (Figma "Plan Detail Redesign"): a transparent
 * header with back and "…" and no title, the Plan's hero and its Workouts,
 * and a designed state for loading, a failed read, a Plan that's gone and one
 * with no Workouts. The "…" menu offers Edit Plan and Delete Plan on every
 * Plan; an inactive Plan with Workouts has Activate Plan pinned at the
 * bottom. Every action follows the shared Plan actions rule
 * (`usePlanActions`), as My Plans does: the Plan summaries are read here too,
 * so activating asks first only when another Plan is (or may be) active.
 */
const RedesignedPlanScreen = () => {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [isPulling, setIsPulling] = useState(false);
  // The pinned action's height, safe area included: the content ends above it.
  const [actionHeight, setActionHeight] = useState(0);

  // `null` once the Plan is gone (deleted, or never the User's). A failed
  // refresh keeps the Plan read last.
  const {
    data: plan,
    error: readError,
    isError,
    refetch,
  } = usePlanQuery({ variables: { id: planId } });

  // Whether another Plan is active decides whether activating asks first.
  const { refetch: refetchSummaries } = usePlanSummariesQuery();

  const backToPlans = useCallback(() => {
    router.dismissTo("/plans");
  }, [router]);

  const { activate, activatingPlanId, edit, isDeleting, remove } =
    usePlanActions({
      onDeleted: backToPlans,
    });

  // The Workout rows' timer comes from the open Workout Session's own read,
  // so a pull refreshes it too.
  const onRefresh = useCallback(async () => {
    setIsPulling(true);
    // None rejects: a failed read is the query's error, and it keeps what was
    // read.
    await Promise.all([
      refetch(),
      refetchSummaries(),
      queryClient.refetchQueries({
        queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
      }),
    ]);
    setIsPulling(false);
  }, [refetch, refetchSummaries, queryClient]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const openEditor = useCallback(() => {
    edit(planId);
  }, [edit, planId]);

  const measureAction = useCallback((event: LayoutChangeEvent) => {
    setActionHeight(event.nativeEvent.layout.height);
  }, []);

  // Not on the active Plan, and not before the Plan has a Workout to train.
  const activatable =
    plan && !plan.is_active && plan.workouts.length > 0 ? plan : null;

  const activateShown = useCallback(() => {
    if (activatable) {
      activate(activatable);
    }
  }, [activate, activatable]);

  const renderContent = () => {
    if (plan) {
      return <PlanDetailView onAddWorkout={openEditor} plan={plan} />;
    }

    if (plan === null) {
      return (
        <ExerciseUnavailable
          action={{ label: t("plans.notFound.back"), onPress: backToPlans }}
          message={t("plans.errors.notFound")}
          symbol="magnifyingglass"
          title={t("plans.notFound.title")}
        />
      );
    }

    if (isError) {
      const waitSeconds = rateLimitedFor(readError);

      return (
        <ExerciseUnavailable
          action={{ label: t("common.tryAgain"), onPress: retry }}
          message={
            waitSeconds === null
              ? t("exercise.checkConnection")
              : t("common.rateLimited", { seconds: waitSeconds })
          }
          symbol="exclamationmark.triangle"
          title={t("plans.planError.title")}
        />
      );
    }

    return <PlanDetailSkeleton />;
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTransparent: true,
          scrollEdgeEffects: activatable
            ? PINNED_SCROLL_EDGE_EFFECTS
            : undefined,
          title: "",
          // Its actions need the Plan, so the loading and failed states have
          // no menu. No icons, as on My Plans' long-press menu.
          unstable_headerRightItems: () =>
            plan
              ? [
                  {
                    icon: { name: "ellipsis", type: "sfSymbol" },
                    label: t("plans.moreOptions"),
                    menu: {
                      items: [
                        {
                          label: t("plans.edit"),
                          onPress: openEditor,
                          type: "action",
                        },
                        {
                          destructive: true,
                          // One change at a time: deleting while the Plan
                          // activates would get past the active Plan's rule.
                          disabled: activatingPlanId !== null,
                          label: t("plans.delete.action"),
                          onPress: () => remove(plan),
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
        className="flex-1"
        contentContainerClassName="px-sm grow"
        contentContainerStyle={{
          paddingBottom: activatable
            ? actionHeight + BOTTOM_GAP
            : insets.bottom + BOTTOM_GAP,
        }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={isPulling} />
        }
        testID="plan-screen"
      >
        {renderContent()}
      </ScrollView>
      {activatable ? (
        <ScopedVariables
          variables={{ "--plan-action-bottom": insets.bottom + BOTTOM_GAP }}
        >
          <View
            className="px-sm absolute inset-x-0 bottom-0 pb-(--plan-action-bottom)"
            onLayout={measureAction}
            pointerEvents="box-none"
          >
            <Button
              disabled={isDeleting}
              isLoading={activatingPlanId === activatable.id}
              label={t("plans.activate.action")}
              loadingLabel={t("plans.activate.action")}
              onPress={activateShown}
              size="lg"
              testID="activate-plan-button"
            />
          </View>
        </ScopedVariables>
      ) : null}
    </>
  );
};

/** A Plan's screen: the redesign behind its flag, today's otherwise. */
const PlanScreen = () =>
  isPlansRedesignEnabled() ? <RedesignedPlanScreen /> : <LegacyPlanScreen />;

export default PlanScreen;
