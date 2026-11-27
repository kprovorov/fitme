import { rateLimitedFor } from "@fitme/api-client";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ExerciseUnavailable } from "~/components/exercises/exercise-unavailable";
import { ActivePlanCard } from "~/components/plans/active-plan-card";
import { CreatePlanChoices } from "~/components/plans/create-plan-choices";
import { PlanRow } from "~/components/plans/plan-row";
import { SymbolImage } from "~/components/symbol-image";
import { Card } from "~/components/ui/card";
import { Text } from "~/components/ui/text";
import { H4, Large, Muted } from "~/components/ui/typography";
import { usePlanActions } from "~/hooks/plan-actions";
import type { PlanMenuAction } from "~/hooks/plan-actions";
import type { PlanSummary } from "~/hooks/queries/plans";
import { CREATE_PLAN_NAMING_STEP } from "~/lib/plan-draft";

/** The empty state's symbol, standing alone over its title. */
const EMPTY_SYMBOL_SIZE = 48;

/** How many rows the skeleton's list card draws. */
const SKELETON_ROWS = ["first", "second", "third"] as const;

/** How many Workout chips the skeleton's hero card draws. */
const SKELETON_CHIPS = ["a", "b", "c", "d"] as const;

/**
 * While the Plans load (Figma's Plans Redesign · Loading): grey bars where
 * the hero card and the rows go, read by VoiceOver as one element saying
 * it's loading.
 */
const MyPlansSkeleton = () => {
  const { t } = useTranslation();

  return (
    <View
      accessibilityLabel={t("plans.loading")}
      accessibilityRole="progressbar"
      accessible
      className="gap-lg pt-2"
    >
      <Card padding="none">
        <View className="gap-4 p-6">
          <View className="gap-2">
            <View className="bg-muted h-5 w-16 rounded-full" />
            <View className="bg-muted h-7 w-3/5 rounded-full" />
          </View>
          <View className="gap-1">
            <View className="bg-muted h-4 w-full rounded-full" />
            <View className="bg-muted h-4 w-3/5 rounded-full" />
          </View>
          <View className="flex-row gap-2">
            <View className="bg-muted h-4 w-1/4 rounded-full" />
            <View className="bg-muted h-4 w-1/4 rounded-full" />
            <View className="bg-muted h-4 w-1/4 rounded-full" />
          </View>
          <View className="gap-2">
            <View className="bg-muted h-4 w-1/5 rounded-full" />
            <View className="flex-row gap-2">
              {SKELETON_CHIPS.map((chip) => (
                <View className="bg-muted h-5 flex-1 rounded-full" key={chip} />
              ))}
            </View>
          </View>
        </View>
      </Card>
      <View className="gap-2">
        <View className="bg-muted mx-4 h-4 w-1/4 rounded-full" />
        <Card padding="none">
          {SKELETON_ROWS.map((row) => (
            <View className="gap-2 px-4 py-3" key={row}>
              <View className="bg-muted h-5 w-2/5 rounded-full" />
              <View className="bg-muted h-4 w-3/5 rounded-full" />
            </View>
          ))}
        </Card>
      </View>
    </View>
  );
};

/** With no active Plan: what to do about it, wrapping at any length. */
const NoActivePlanCard = () => {
  const { t } = useTranslation();

  return (
    <Card>
      <View accessible className="flex-row items-start gap-3">
        <SymbolImage
          className="text-body text-muted-foreground shrink-0"
          name="info.circle"
        />
        <View className="flex-1 gap-1">
          <Text className="text-headline-emphasized text-foreground">
            {t("plans.noActivePlan.title")}
          </Text>
          <Text className="text-body text-muted-foreground">
            {t("plans.noActivePlan.message")}
          </Text>
        </View>
      </View>
    </Card>
  );
};

/** No Plans at all: the two Create Plan choices, right there. */
const NoPlans = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const buildByHand = useCallback(() => {
    router.push({
      params: { step: CREATE_PLAN_NAMING_STEP },
      pathname: "/plans/create",
    });
  }, [router]);

  const openPlanner = useCallback(() => {
    router.push("/planner");
  }, [router]);

  return (
    <View className="gap-md flex-1 justify-center">
      <View className="gap-sm items-center">
        <SymbolImage
          className="text-muted-foreground"
          name="dumbbell"
          size={EMPTY_SYMBOL_SIZE}
        />
        <View className="gap-xs items-center">
          <Large className="text-center">{t("plans.empty.title")}</Large>
          <Muted className="text-center">{t("plans.empty.message")}</Muted>
        </View>
      </View>
      <View className="gap-4">
        <CreatePlanChoices
          onBuildByHand={buildByHand}
          onOpenPlanner={openPlanner}
        />
      </View>
    </View>
  );
};

interface MyPlansViewProps {
  error: unknown;
  /** Whether a read is on its way, so Try Again shows the skeleton. */
  isFetching: boolean;
  onRetry: () => void;
  /** The Plans read, newest first, or `undefined` before any read landed. */
  plans: PlanSummary[] | undefined;
}

/**
 * My Plans (Figma's Plans Redesign frames). The
 * Plans read win over a failure, so a failed refresh keeps them shown; with
 * none read a failure is the load error (the wait for a 429) with Try Again,
 * and otherwise (Try Again included) the skeleton shows until they arrive.
 */
export const MyPlansView = ({
  error,
  isFetching,
  onRetry,
  plans,
}: MyPlansViewProps) => {
  const { t } = useTranslation();
  const router = useRouter();

  const { activate, activatingPlanId, edit, isDeleting, remove } =
    usePlanActions();

  const openPlan = useCallback(
    (id: string) => router.push(`/plans/${id}`),
    [router]
  );

  // The long-press menu's items, and VoiceOver's actions, for one Plan.
  // While a Plan is being activated, no Plan can be activated or deleted;
  // Edit stays.
  const actionsFor = (plan: PlanSummary): PlanMenuAction[] => [
    { label: t("plans.edit"), name: "edit", onPress: () => edit(plan.id) },
    // The active Plan has nothing to activate.
    ...(plan.is_active
      ? []
      : [
          {
            // Nor while a Plan is being deleted: it could be this one.
            disabled: isDeleting || activatingPlanId !== null,
            label: t("plans.activate.action"),
            name: "activate",
            onPress: () => activate(plan),
          },
        ]),
    {
      destructive: true,
      // One delete at a time, and none while a Plan is being activated.
      disabled: isDeleting || activatingPlanId !== null,
      label: t("plans.delete.action"),
      name: "delete",
      onPress: () => remove(plan),
    },
  ];

  if (!plans) {
    if (error && !isFetching) {
      const waitSeconds = rateLimitedFor(error);

      return (
        <ExerciseUnavailable
          action={{ label: t("common.tryAgain"), onPress: onRetry }}
          message={
            waitSeconds === null
              ? t("exercise.checkConnection")
              : t("common.rateLimited", { seconds: waitSeconds })
          }
          symbol="exclamationmark.triangle"
          title={t("plans.listError.title")}
        />
      );
    }

    return <MyPlansSkeleton />;
  }

  if (plans.length === 0) {
    return <NoPlans />;
  }

  const active = plans.find((plan) => plan.is_active);
  const others = plans.filter((plan) => plan !== active);

  const rows =
    others.length > 0 ? (
      <Card padding="none">
        {others.map((plan, index) => (
          <PlanRow
            actions={actionsFor(plan)}
            isActivating={plan.id === activatingPlanId}
            isFirst={index === 0}
            key={plan.id}
            onPress={() => openPlan(plan.id)}
            plan={plan}
          />
        ))}
      </Card>
    ) : null;

  return (
    <View className="gap-lg pt-2">
      {active ? (
        <ActivePlanCard
          actions={actionsFor(active)}
          onPress={() => openPlan(active.id)}
          plan={active}
        />
      ) : (
        <NoActivePlanCard />
      )}
      {active && rows ? (
        <View className="gap-2">
          <H4 className="mx-4">{t("plans.otherPlans")}</H4>
          {rows}
        </View>
      ) : (
        rows
      )}
    </View>
  );
};
