import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import type { AccessibilityActionEvent } from "react-native";

import {
  PLANS_QUERY_KEY,
  useActivatePlanMutation,
  useDeletePlanMutation,
  usePlanSummariesQuery,
} from "~/hooks/queries/plans";
import type { PlanSummary } from "~/hooks/queries/plans";
import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";
import { OPEN_WORKOUT_SESSION_QUERY_KEY } from "~/hooks/queries/workout-sessions";
import { isStillWriteStarter } from "~/lib/write-answers";

/**
 * What to tell the User after a failed Plan write. A 404 means the Plan is
 * gone; a 429 gives the wait. Any other failure doesn't prove nothing changed
 * (the answer can be lost after the write commits), so it never says either
 * way.
 */
export const planWriteFailureMessage = (t: TFunction, error: unknown) => {
  const apiError = error instanceof ApiError ? error : null;

  if (apiError?.code === "not_found") {
    return t("plans.errors.notFound");
  }

  const waitSeconds = rateLimitedFor(apiError);

  return waitSeconds === null
    ? t("plans.errors.network")
    : t("plans.errors.rateLimited", { seconds: waitSeconds });
};

/** The Plan an action is taken on: its id and whether it's the active one. */
export interface PlanActionTarget {
  id: string;
  is_active: boolean;
}

/**
 * What a User can do to a Plan without opening it, the one rule My Plans
 * follows and the Plan's own screen moves onto with the Plan detail redesign:
 *
 * - `edit` opens the Plan editor modal over the screen it's called from.
 * - `activate` makes the Plan the active one. With no active Plan it does so
 *   at once; with another one active, or when the Plan summaries haven't been
 *   read, it first asks "Activate Plan" ("This will deactivate your current
 *   plan"). Success plays the success haptic and nothing else: the Plans are
 *   read again (the mutation's own seeding), so the Plan moves into the hero
 *   card where the list shows one. A failure alerts "Couldn't Activate Plan"
 *   (the wait for a 429, the Plan being gone for a 404) and reads the Plans
 *   again. A Workout Session open on any Plan is left alone.
 * - `remove` refuses the active Plan ("Can't Delete Active Plan", nothing
 *   deleted); any other Plan asks "Delete Plan?" first, then deletes it. A
 *   failure alerts "Couldn't Delete Plan" (the wait for a 429, the Plan being
 *   gone for a 404). The Plans are read again either way, so a deleted one
 *   leaves every list. A Workout Session open on it keeps running.
 *
 * `onDeleted` runs once the API has deleted the Plan (the Plan screen leaves),
 * and `onActivated` once the API has activated it. `activatingPlanId` is the
 * Plan an activation is on its way for, `null` otherwise.
 */
export const usePlanActions = ({
  onActivated,
  onDeleted,
}: {
  onActivated?: (planId: string) => void;
  onDeleted?: (planId: string) => void;
} = {}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const refreshPlans = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
    // Deleting a Plan can change the Weekly goal.
    void queryClient.invalidateQueries({ queryKey: WEEKLY_GOALS_QUERY_KEY });
    // A Workout Session open on the deleted Plan keeps running; its read
    // names the Plan.
    void queryClient.invalidateQueries({
      queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
    });
  }, [queryClient]);

  const { isPending: isDeleting, mutate: deletePlan } = useDeletePlanMutation({
    onError: (error) => {
      Alert.alert(t("plans.delete.failed"), planWriteFailureMessage(t, error));
    },
    onSettled: refreshPlans,
    onSuccess: (_data, { id }) => {
      onDeleted?.(id);
    },
  });

  // No hook-level `onSuccess`: it would replace the mutation's own, which
  // shows the activated Plan from the answer and reads the Plans again.
  const {
    isPending: isActivating,
    mutate: activatePlan,
    variables: activating,
  } = useActivatePlanMutation({
    // Nothing for a User who has signed out since.
    onError: (error, _variables, starter) => {
      if (!isStillWriteStarter(starter)) {
        return;
      }

      Alert.alert(
        t("plans.activate.failed"),
        planWriteFailureMessage(t, error)
      );
      // A failed call doesn't prove nothing changed.
      void queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["plan"] });
      void queryClient.invalidateQueries({ queryKey: WEEKLY_GOALS_QUERY_KEY });
    },
  });

  const activateNow = useCallback(
    (planId: string) => {
      activatePlan(
        { id: planId },
        {
          onSuccess: (_plan, _variables, starter) => {
            if (!isStillWriteStarter(starter)) {
              return;
            }

            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
            onActivated?.(planId);
          },
        }
      );
    },
    [activatePlan, onActivated]
  );

  const activate = useCallback(
    (plan: PlanActionTarget) => {
      if (plan.is_active) {
        return;
      }

      const summaries = queryClient.getQueryData<PlanSummary[]>(
        usePlanSummariesQuery.getKey()
      );

      // Unread summaries can't tell, so they ask too.
      const anotherActive =
        summaries === undefined ||
        summaries.some((other) => other.is_active && other.id !== plan.id);

      if (!anotherActive) {
        activateNow(plan.id);

        return;
      }

      Alert.alert(t("plans.activate.title"), t("plans.activate.message"), [
        { style: "cancel", text: t("common.cancel") },
        {
          onPress: () => activateNow(plan.id),
          text: t("plans.activate.confirm"),
        },
      ]);
    },
    [activateNow, queryClient, t]
  );

  const edit = useCallback(
    (planId: string) => {
      router.push({ params: { planId }, pathname: "/plans/[planId]/edit" });
    },
    [router]
  );

  const remove = useCallback(
    (plan: PlanActionTarget) => {
      if (plan.is_active) {
        Alert.alert(
          t("plans.delete.activeTitle"),
          t("plans.delete.activeMessage"),
          [{ text: t("common.ok") }]
        );

        return;
      }

      Alert.alert(t("plans.delete.title"), t("plans.delete.message"), [
        { style: "cancel", text: t("common.cancel") },
        {
          onPress: () => deletePlan({ id: plan.id }),
          style: "destructive",
          text: t("plans.delete.confirm"),
        },
      ]);
    },
    [deletePlan, t]
  );

  return {
    activate,
    activatingPlanId: isActivating ? (activating?.id ?? null) : null,
    edit,
    isDeleting,
    remove,
  };
};

/** One thing a User can do to a Plan from My Plans' long-press menu. */
export interface PlanMenuAction {
  destructive?: boolean;
  /** Shown dimmed in the menu, and left out of VoiceOver's actions. */
  disabled?: boolean;
  label: string;
  /** The VoiceOver custom action's name, unique among a Plan's actions. */
  name: string;
  onPress: () => void;
}

/**
 * The same actions as VoiceOver custom actions, for the card's or row's own
 * accessible element (the long-press menu itself isn't reachable by
 * VoiceOver).
 */
export const planMenuAccessibility = (actions: PlanMenuAction[]) => {
  const enabled = actions.filter((action) => !action.disabled);

  return {
    accessibilityActions: enabled.map(({ label, name }) => ({ label, name })),
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      enabled
        .find((action) => action.name === event.nativeEvent.actionName)
        ?.onPress();
    },
  };
};
