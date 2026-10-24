import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { SFSymbol } from "sf-symbols-typescript";
import { SymbolImage } from "@/components/symbol-image";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Text as UIText } from "@/components/ui/text";
import {
  type ShownExercise,
  useExercises,
} from "@/hooks/queries/exercise-library";
import { useCreatePlanMutation } from "@/hooks/queries/plans";
import { ApiError, rateLimitedFor } from "~/lib/api/client";
import {
  canSavePlanCard,
  hasExercisesWithoutSlugs,
  planCardBody,
  type WorkoutDay,
  type WorkoutExercise,
  type WorkoutPlan,
} from "~/lib/plan-card";

export type { WorkoutDay, WorkoutExercise, WorkoutPlan } from "~/lib/plan-card";

const GOAL_LABELS: Record<WorkoutPlan["goal"], string> = {
  endurance: "Endurance",
  general_fitness: "General Fitness",
  muscle_gain: "Gain Muscle",
  strength: "Strength",
  weight_loss: "Weight Loss",
};

const GOAL_ICONS: Record<WorkoutPlan["goal"], SFSymbol> = {
  endurance: "heart",
  general_fitness: "figure.walk",
  muscle_gain: "dumbbell",
  strength: "figure.strengthtraining.traditional",
  weight_loss: "figure.run",
};

/** What the card says when saving failed, by the Public API's answer. */
const saveErrorMessage = (error: unknown) => {
  const seconds = rateLimitedFor(error);
  if (seconds !== null) {
    return `Too many requests. Try again in ${seconds} s.`;
  }
  const code = error instanceof ApiError ? error.code : null;
  if (code === "unknown_exercises") {
    return "This plan has exercises we don't know, so it can't be saved. Ask the Coach for another plan.";
  }
  if (code === "exercise_library_unavailable") {
    return "Couldn't check this plan's exercises. Try again.";
  }
  return "Couldn't save the plan. Try again.";
};

function PlanTag({ icon, label }: { icon: SFSymbol; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-muted/40 px-3 py-1.5">
      <SymbolImage
        className="text-footnote text-muted-foreground"
        name={icon}
      />
      <Text className="text-footnote text-muted-foreground">{label}</Text>
    </View>
  );
}

function ExerciseRow({
  exercise,
  shown,
}: {
  exercise: WorkoutExercise;
  /** The Exercise as resolved by `useExercises`, if it has a slug. */
  shown: ShownExercise | undefined;
}) {
  // The Exercise Library's name once resolved, otherwise the Coach's.
  const isResolved = !!shown?.isResolved;
  const name = shown?.isResolved ? shown.name : exercise.name;
  const handlePress = useCallback(
    () => router.push(`/exercises/${exercise.exercise_slug}`),
    [exercise.exercise_slug]
  );

  return (
    <Pressable
      accessibilityRole={isResolved ? "button" : undefined}
      className="flex-row items-center border-border/15 border-b py-3 active:opacity-60"
      disabled={!isResolved}
      onPress={handlePress}
    >
      <Text className="w-8 text-primary text-subhead-emphasized">
        {exercise.sets}×
      </Text>
      <Text className="flex-1 text-foreground text-subhead" numberOfLines={1}>
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
}

function WorkoutDaySection({
  workout,
  last,
}: {
  workout: WorkoutDay;
  last: boolean;
}) {
  const shownBySlug = useExercises(
    workout.exercises.flatMap(({ exercise_slug }) =>
      exercise_slug ? [exercise_slug] : []
    )
  );
  return (
    <View className={last ? "" : "mb-6"}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-primary text-subhead-emphasized">
          {workout.name}
        </Text>
        <View className="flex-row items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1">
          <SymbolImage
            className="text-footnote-emphasized text-foreground"
            name="bolt.fill"
          />
          <Text className="text-footnote-emphasized text-foreground">
            {workout.exercises.length}
          </Text>
        </View>
      </View>
      <View className="mb-1 border-border/20 border-b" />
      {workout.exercises.map((ex, index) => (
        <ExerciseRow
          exercise={ex}
          // The same Exercise can appear twice in a Workout.
          // biome-ignore lint/suspicious/noArrayIndexKey: the list never reorders
          key={`${ex.exercise_slug}-${index}`}
          shown={ex.exercise_slug ? shownBySlug[ex.exercise_slug] : undefined}
        />
      ))}
    </View>
  );
}

export function WorkoutPlanCard({ plan }: { plan: WorkoutPlan }) {
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
  const placeLabel = plan.place === "home" ? "Home" : "Gym";

  return (
    <Animated.View
      className="mt-1 overflow-hidden rounded-2xl border border-border/20 bg-secondary/60"
      entering={FadeIn.duration(300)}
      style={{ borderCurve: "continuous" }}
    >
      <View className="border-border/20 border-b px-4 pt-4 pb-3">
        <Text className="mb-3 text-foreground text-title-3-emphasized">
          {plan.name}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <PlanTag
            icon={GOAL_ICONS[plan.goal]}
            label={GOAL_LABELS[plan.goal]}
          />
          <PlanTag
            icon="bolt.fill"
            label={`${plan.frequencyPerWeek}x / week`}
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
          <View className="mb-3 rounded-xl bg-destructive/10 px-3 py-2.5">
            <UIText className="text-destructive text-footnote">
              Some exercises could not be matched to the library and cannot be
              saved. Try regenerating the plan.
            </UIText>
          </View>
        )}
        {saveError && !saved ? (
          <ErrorMessage className="mb-3">
            {saveErrorMessage(saveError)}
          </ErrorMessage>
        ) : null}
        <Button
          disabled={saved || !canSave}
          isLoading={isSaving}
          label={saved ? "Plan Saved" : "Save Plan"}
          onPress={handleSave}
        />
      </View>
    </Animated.View>
  );
}
