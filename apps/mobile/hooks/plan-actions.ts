import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import type { AccessibilityActionEvent } from "react-native";

import { PLANS_QUERY_KEY, useDeletePlanMutation } from "~/hooks/queries/plans";
import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";

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
 * What a User can do to a Plan without opening it, shared by My Plans and the
 * Plan's own screen so both follow one rule:
 *
 * - `edit` opens the Plan editor modal over the screen it's called from.
 * - `remove` refuses the active Plan ("Can't Delete Active Plan", nothing
 *   deleted); any other Plan asks "Delete Plan?" first, then deletes it. A
 *   failure alerts "Couldn't Delete Plan" (the wait for a 429, the Plan being
 *   gone for a 404). The Plans are read again either way, so a deleted one
 *   leaves every list. A Workout Session open on it keeps running.
 *
 * `onDeleted` runs once the API has deleted the Plan (the Plan screen leaves).
 */
export const usePlanActions = ({
  onDeleted,
}: { onDeleted?: (planId: string) => void } = {}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const refreshPlans = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
    // Deleting a Plan can change the Weekly goal.
    void queryClient.invalidateQueries({ queryKey: WEEKLY_GOALS_QUERY_KEY });
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

  return { edit, isDeleting, remove };
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
