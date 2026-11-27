import type { ExperienceLevel, Goal, Place } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { ExerciseUnavailable } from "~/components/exercises/exercise-unavailable";
import { SymbolImage } from "~/components/symbol-image";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H1, H4, P } from "~/components/ui/typography";
import type { FullPlan } from "~/hooks/queries/plans";
import { useChoiceLabels } from "~/lib/choices";

import {
  FREQUENCY_SYMBOL,
  goalSymbol,
  LEVEL_SYMBOL,
  placeSymbol,
} from "./plan-symbols";
import PlanWorkoutRow from "./plan-workout-row";

/** A Plan's Workout duration, next to its other details. */
const DURATION_SYMBOL: SFSymbol = "clock";

/** The skeleton's Workout rows and each one's thumbnails. */
const SKELETON_ROWS = [0, 1, 2];
const SKELETON_THUMBNAILS = [0, 1, 2, 3, 4];

export const PLAN_DETAIL = "plan-detail";
export const PLAN_DETAIL_LOADING = "plan-detail-loading";

interface PlanMetaItem {
  icon: SFSymbol;
  key: string;
  label: string;
}

/**
 * The Plan's details under its name: goal, level, frequency, Workout
 * duration and place, each one it hasn't got left out (ADR 0017).
 */
const usePlanMeta = (plan: FullPlan): PlanMetaItem[] => {
  const labels = useChoiceLabels();
  const { t } = useTranslation();
  // The API answers these as the columns' text: an id this build doesn't
  // know shows as itself (`useChoiceLabels`) with the default symbol.
  // SAFETY: goalSymbol defaults for unknown strings and labels.goal returns unknown ids unchanged.
  const goal = plan.goal as Goal | null;
  // SAFETY: labels.experienceLevel returns unknown string ids unchanged; the icon is constant.
  const level = plan.experience_level as ExperienceLevel | null;
  // SAFETY: placeSymbol defaults for unknown strings and labels.place returns unknown ids unchanged.
  const place = plan.place as Place | null;

  return [
    ...(goal
      ? [{ icon: goalSymbol(goal), key: "goal", label: labels.goal(goal) }]
      : []),
    ...(level
      ? [
          {
            icon: LEVEL_SYMBOL,
            key: "level",
            label: labels.experienceLevel(level),
          },
        ]
      : []),
    {
      icon: FREQUENCY_SYMBOL,
      key: "frequency",
      label: t("plans.frequency", { count: plan.frequency }),
    },
    ...(plan.workout_duration === null
      ? []
      : [
          {
            icon: DURATION_SYMBOL,
            key: "duration",
            label: t("plannedWorkout.durationMinutes", {
              minutes: plan.workout_duration,
            }),
          },
        ]),
    ...(place
      ? [{ icon: placeSymbol(place), key: "place", label: labels.place(place) }]
      : []),
  ];
};

/**
 * The top of the Plan screen: the Active badge on the active Plan, its name
 * as a Large Title, its details, and its description in full.
 */
const PlanHero = ({ plan }: { plan: FullPlan }) => {
  const { t } = useTranslation();
  const meta = usePlanMeta(plan);

  return (
    <View className="px-sm gap-xs items-start">
      {plan.is_active ? (
        <Badge>
          <Text>{t("plans.active")}</Text>
        </Badge>
      ) : null}
      {/* White, as Figma has it, not H1's lime. */}
      <H1 className="text-foreground">{plan.name}</H1>
      {/* A row of Views, never inside a Text: iOS reads a View nested in
          Text as an object replacement character. */}
      <View className="gap-x-xs flex-row flex-wrap gap-y-1">
        {meta.map((item) => (
          <View className="flex-row items-center gap-1" key={item.key}>
            <SymbolImage
              className="text-footnote text-muted-foreground"
              name={item.icon}
            />
            <Text className="text-footnote text-muted-foreground">
              {item.label}
            </Text>
          </View>
        ))}
      </View>
      {plan.description?.trim() ? <P>{plan.description}</P> : null}
    </View>
  );
};

interface PlanDetailViewProps {
  /** Opens the Plan editor: No Workouts' Add Workout. */
  onAddWorkout: () => void;
  plan: FullPlan;
}

/**
 * A Plan's screen (Figma "Plan Detail Redesign"): the hero, then
 * "Workouts" over one card of its Workouts in rotation order, or, with none,
 * No Workouts with Add Workout.
 */
const PlanDetailView = ({ onAddWorkout, plan }: PlanDetailViewProps) => {
  const { t } = useTranslation();
  const workouts = plan.workouts.toSorted((a, b) => a.order - b.order);

  return (
    <View className="gap-lg flex-1 pt-2" testID={PLAN_DETAIL}>
      <PlanHero plan={plan} />
      {workouts.length > 0 ? (
        <View className="gap-xs">
          <View className="px-sm">
            <H4>{t("home.workouts")}</H4>
          </View>
          <Card padding="none">
            {workouts.map((workout, index) => (
              <PlanWorkoutRow
                key={workout.id}
                planId={plan.id}
                separated={index > 0}
                workout={workout}
              />
            ))}
          </Card>
        </View>
      ) : (
        <ExerciseUnavailable
          action={{ label: t("planEditor.addWorkout"), onPress: onAddWorkout }}
          fillAction
          message={t("plans.noWorkouts.message")}
          symbol="plus"
          title={t("plans.noWorkouts.title")}
        />
      )}
    </View>
  );
};

/** A placeholder block of the skeleton. */
const Bone = ({ className }: { className: string }) => (
  <View className={`bg-muted rounded-full ${className}`} />
);

/**
 * The Plan screen while its Plan loads, shaped like it: the name, the
 * details and description, then a card of three Workout rows. VoiceOver
 * reads it as one element saying it's loading.
 */
export const PlanDetailSkeleton = () => {
  const { t } = useTranslation();

  return (
    <View
      accessibilityLabel={t("plans.loadingPlan")}
      accessibilityRole="progressbar"
      accessible
      className="gap-lg pt-2"
      testID={PLAN_DETAIL_LOADING}
    >
      <View className="px-sm gap-xs">
        <Bone className="h-8 w-3/5" />
        <View className="gap-xs flex-row">
          <Bone className="h-4 w-1/5" />
          <Bone className="h-4 w-1/5" />
          <Bone className="h-4 w-1/5" />
        </View>
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-2/3" />
      </View>
      <View className="gap-xs">
        <View className="px-sm">
          <Bone className="h-4 w-1/4" />
        </View>
        <Card padding="none">
          {SKELETON_ROWS.map((row) => (
            <View className="px-sm" key={row}>
              {row > 0 ? <Separator /> : null}
              <View className="py-sm gap-3">
                <View className="flex-row justify-between">
                  <Bone className="h-5 w-2/5" />
                  <Bone className="h-4 w-1/5" />
                </View>
                <View className="gap-xs flex-row">
                  {SKELETON_THUMBNAILS.map((thumbnail) => (
                    <View
                      className="bg-muted size-12.5 rounded-xl"
                      key={thumbnail}
                    />
                  ))}
                </View>
              </View>
            </View>
          ))}
        </Card>
      </View>
    </View>
  );
};

export default PlanDetailView;
