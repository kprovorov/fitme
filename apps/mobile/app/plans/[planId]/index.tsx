import { rateLimitedFor } from "@fitme/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LayoutChangeEvent } from "react-native";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScopedVariables } from "uniwind";

import { ExerciseUnavailable } from "~/components/exercises/exercise-unavailable";
import PlanDetailView, {
  PlanDetailSkeleton,
} from "~/components/plans/plan-detail-view";
import { Button } from "~/components/ui/button";
import { usePlanActions } from "~/hooks/plan-actions";
import { usePlanQuery, usePlanSummariesQuery } from "~/hooks/queries/plans";
import { OPEN_WORKOUT_SESSION_QUERY_KEY } from "~/hooks/queries/workout-sessions";

/** Space between the pinned Activate Plan and the bottom safe area. */
const BOTTOM_GAP = 16;

/**
 * The Plan screen (Figma "Plan Detail Redesign"): a transparent header with
 * back and "…" and no title, the Plan's hero and its Workouts, and a
 * designed state for loading, a failed read, a Plan that's gone and one
 * with no Workouts. The "…" menu offers Edit Plan and Delete Plan on every
 * Plan; an inactive Plan with Workouts has Activate Plan pinned at the
 * bottom. Every action follows the shared Plan actions rule
 * (`usePlanActions`), as My Plans does: the Plan summaries are read here too,
 * so activating asks first only when another Plan is (or may be) active.
 */
const PlanScreen = () => {
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

  const activatePlan = useCallback(() => {
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
                          disabled: isDeleting || activatingPlanId !== null,
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
            ? actionHeight
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
            className="px-sm absolute inset-x-0 bottom-0 pt-10 pb-(--plan-action-bottom)"
            onLayout={measureAction}
            pointerEvents="box-none"
          >
            {/* The bottom scroll edge effect (Figma's "Scroll Edge Effect ·
                bottom"): the content fades into the background under the
                button. iOS draws its own only under system bars. */}
            <View
              className="to-background absolute inset-0 bg-linear-to-b from-transparent to-30%"
              pointerEvents="none"
            />
            <Button
              disabled={isDeleting}
              isLoading={activatingPlanId === activatable.id}
              label={t("plans.activate.action")}
              loadingLabel={t("plans.activate.action")}
              onPress={activatePlan}
              size="lg"
              testID="activate-plan-button"
            />
          </View>
        </ScopedVariables>
      ) : null}
    </>
  );
};

export default PlanScreen;
