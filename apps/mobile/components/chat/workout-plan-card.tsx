import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { formatCount, formatNumber } from "@fitme/i18n";
import { router } from "expo-router";
import type { TFunction } from "i18next";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "@/components/symbol-image";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Text as UIText } from "@/components/ui/text";
import { useExercises } from "@/hooks/queries/library";
import type { ShownExercise } from "@/hooks/queries/library";
import { useCreatePlanMutation } from "@/hooks/queries/plans";
import { useChoiceLabels } from "~/lib/choices";
import { i18n, useI18n } from "~/lib/i18n";
import {
  canSavePlanCard,
  hasExercisesWithoutSlugs,
  planCardBody,
  planCardGoal,
} from "~/lib/plan-card";
import type { WorkoutDay, WorkoutExercise, WorkoutPlan } from "~/lib/plan-card";

export type { WorkoutPlan } from "~/lib/plan-card";

const GOAL_ICONS: Record<WorkoutPlan["goal"], SFSymbol> = {
  endurance: "heart",
  general_fitness: "figure.walk",
  muscle_gain: "dumbbell",
  strength: "figure.strengthtraining.traditional",
  weight_loss: "figure.run",
};

/** What the card says when saving failed, by the Public API's answer. */
const saveErrorMessage = (t: TFunction, error: ApiError | null) => {
  const seconds = rateLimitedFor(error);

  if (seconds !== null) {
    return t("arnold.planCard.errors.rateLimited", { seconds });
  }

  const code = error?.code;

  if (code === "unknown_exercises") {
    return t("arnold.planCard.errors.unknownExercises");
  }

  if (code === "library_unavailable") {
    return t("arnold.planCard.errors.libraryUnavailable");
  }

  return t("arnold.planCard.errors.generic");
};

const exerciseKeys = new WeakMap<WorkoutExercise, number>();
let nextExerciseKey = 0;

const exerciseKey = (exercise: WorkoutExercise): number => {
  const existing = exerciseKeys.get(exercise);

  if (existing !== undefined) {
    return existing;
  }

  const key = nextExerciseKey;
  nextExerciseKey += 1;
  exerciseKeys.set(exercise, key);

  return key;
};

const PlanTag = ({ icon, label }: { icon: SFSymbol; label: string }) => (
  <View className="bg-muted/40 flex-row items-center gap-1.5 rounded-full px-3 py-1.5">
    <SymbolImage className="text-footnote text-muted-foreground" name={icon} />
    <Text className="text-footnote text-muted-foreground">{label}</Text>
  </View>
);

const ExerciseRow = ({
  exercise,
  shown,
}: {
  exercise: WorkoutExercise;
  /** The Exercise as resolved by `useExercises`, if it has a slug. */
  shown: ShownExercise | undefined;
}) => {
  const { t } = useTranslation(undefined, { i18n });
  const translator = useI18n();
  // The Library's name once resolved, otherwise Arnold's.
  const isResolved = !!shown?.isResolved;
  const name = shown?.isResolved ? shown.name : exercise.name;

  const handlePress = useCallback(
    () => router.push(`/exercises/${exercise.exercise_slug}`),
    [exercise.exercise_slug]
  );

  return (
    <Pressable
      accessibilityRole={isResolved ? "button" : undefined}
      className="border-border/15 flex-row items-center border-b py-3 active:opacity-60"
      disabled={!isResolved}
      onPress={handlePress}
    >
      <Text
        accessibilityLabel={formatCount(translator, "sets", exercise.sets)}
        className="text-primary text-subhead-emphasized w-8"
      >
        {t("arnold.planCard.setCount", { count: exercise.sets })}
      </Text>
      <Text className="text-foreground text-subhead flex-1" numberOfLines={1}>
        {name}
      </Text>
      {isResolved ? (
        <SymbolImage
          className="text-muted-foreground text-subhead"
          name="chevron.right"
        />
      ) : null}
    </Pressable>
  );
};

const WorkoutDaySection = ({
  workout,
  last,
}: {
  workout: WorkoutDay;
  last: boolean;
}) => {
  const translator = useI18n();

  const shownBySlug = useExercises(
    workout.exercises.flatMap(({ exercise_slug }) =>
      exercise_slug ? [exercise_slug] : []
    )
  );

  return (
    <View className={last ? "" : "mb-6"}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-primary text-subhead-emphasized flex-1 pr-2">
          {workout.name}
        </Text>
        <View
          accessibilityLabel={formatCount(
            translator,
            "exercises",
            workout.exercises.length
          )}
          accessible
          className="bg-muted/40 flex-row items-center gap-1 rounded-full px-2.5 py-1"
        >
          <SymbolImage
            className="text-footnote-emphasized text-foreground"
            name="bolt.fill"
          />
          <Text className="text-footnote-emphasized text-foreground">
            {formatNumber(translator, workout.exercises.length)}
          </Text>
        </View>
      </View>
      <View className="border-border/20 mb-1 border-b" />
      {workout.exercises.map((ex) => (
        <ExerciseRow
          exercise={ex}
          key={exerciseKey(ex)}
          shown={ex.exercise_slug ? shownBySlug[ex.exercise_slug] : undefined}
        />
      ))}
    </View>
  );
};

export const WorkoutPlanCard = ({ plan }: { plan: WorkoutPlan }) => {
  const { t } = useTranslation(undefined, { i18n });
  const labels = useChoiceLabels();
  const [saved, setSaved] = useState(false);

  const {
    error: saveError,
    isPending: isSaving,
    mutate: createPlan,
  } = useCreatePlanMutation();

  const hasInvalidExercises = hasExercisesWithoutSlugs(plan);
  const canSave = canSavePlanCard(plan);

  const handleSave = useCallback(() => {
    const body = planCardBody(plan);

    if (!body) {
      return;
    }

    createPlan(body, { onSuccess: () => setSaved(true) });
  }, [createPlan, plan]);

  const placeIcon: SFSymbol = plan.place === "home" ? "house" : "building.2";
  const placeLabel = labels.place(plan.place ?? "gym");

  return (
    <Animated.View
      className="border-border/20 bg-secondary/60 border-continuous mt-1 overflow-hidden rounded-2xl border"
      entering={FadeIn.duration(300)}
    >
      <View className="border-border/20 border-b px-4 pt-4 pb-3">
        <Text className="text-foreground text-title-3-emphasized mb-3">
          {plan.name}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <PlanTag
            icon={GOAL_ICONS[plan.goal]}
            label={labels.goal(planCardGoal(plan.goal))}
          />
          <PlanTag
            icon="bolt.fill"
            label={t("arnold.planCard.frequency", {
              count: plan.frequencyPerWeek,
            })}
          />
          {plan.place ? <PlanTag icon={placeIcon} label={placeLabel} /> : null}
        </View>
      </View>

      <View className="px-4 pt-4 pb-4">
        {plan.workouts.map((workout, i) => (
          <WorkoutDaySection
            key={workout.dayLabel}
            last={i === plan.workouts.length - 1}
            workout={workout}
          />
        ))}
      </View>

      <View className="border-border/20 border-t px-4 pt-3 pb-4">
        {hasInvalidExercises && (
          <View className="bg-destructive/10 mb-3 rounded-xl px-3 py-2.5">
            <UIText className="text-destructive text-footnote">
              {t("arnold.planCard.unmatchedExercises")}
            </UIText>
          </View>
        )}
        {saveError && !saved ? (
          <ErrorMessage className="mb-3">
            {saveErrorMessage(
              t,
              saveError instanceof ApiError ? saveError : null
            )}
          </ErrorMessage>
        ) : null}
        <Button
          disabled={saved || !canSave}
          isLoading={isSaving}
          label={t(saved ? "arnold.planCard.saved" : "arnold.planCard.save")}
          onPress={handleSave}
          size="lg"
        />
      </View>
    </Animated.View>
  );
};
