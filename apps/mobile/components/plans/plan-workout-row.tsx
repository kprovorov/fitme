import { formatCount } from "@fitme/i18n";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { ScopedVariables } from "uniwind";

import ExerciseImage from "~/components/exercises/exercise-image";
import { SymbolImage } from "~/components/symbol-image";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { shownExercise, useExercises } from "~/hooks/queries/library";
import type { PlanWorkout } from "~/hooks/queries/plans";
import { useOwnOpenWorkoutSession } from "~/hooks/queries/workout-sessions";
import { useI18n } from "~/lib/i18n";

import OpenSessionBar from "./open-session-bar";

/** A thumbnail's side and corner radius, in points. */
const THUMBNAIL_SIZE = 50;
const THUMBNAIL_RADIUS = 10;

/** How many thumbnails fit a row; past it, the last one is "+N". */
const MAX_THUMBNAILS = 5;

export const PLAN_WORKOUT_MORE = "plan-workout-more";

interface PlanWorkoutRowProps {
  /** The Plan it's in. */
  planId: string;
  /** Whether a separator goes above it: every row but the first. */
  separated: boolean;
  workout: PlanWorkout;
}

/**
 * A Workout of the Plan screen, one row of its Workouts card (Figma's
 * Workout Row): its name, its Exercise count, a chevron, and its first
 * Exercises' thumbnails (all of up to five, else four and "+N"). Pressing it
 * opens the Workout screen. With the Workout's session open, the timer bar
 * sits above it and opens that session. A Workout with no Exercise is the row
 * alone, reading "0 exercises".
 */
const PlanWorkoutRow = ({
  planId,
  separated,
  workout,
}: PlanWorkoutRowProps) => {
  const router = useRouter();
  const { t } = useTranslation();
  const i18n = useI18n();
  const openSession = useOwnOpenWorkoutSession(workout.id);

  const exercises = workout.exercises.toSorted((a, b) => a.order - b.order);

  const shownBySlug = useExercises(
    exercises.map(({ exercise_slug }) => exercise_slug)
  );

  const exerciseCount = formatCount(i18n, "exercises", exercises.length);

  const overflows = exercises.length > MAX_THUMBNAILS;

  const thumbnails = overflows
    ? exercises.slice(0, MAX_THUMBNAILS - 1)
    : exercises;

  const hiddenCount = exercises.length - thumbnails.length;

  const openWorkout = () => {
    router.push(`/plans/${planId}/workouts/${workout.id}`);
  };

  return (
    <View className="px-sm">
      {separated ? <Separator /> : null}
      <View className="py-sm gap-3">
        {openSession ? (
          <OpenSessionBar
            href={`/plans/${planId}/workouts/${workout.id}/sessions/${openSession.id}`}
            startedAt={openSession.started_at}
          />
        ) : null}
        <Pressable
          accessibilityHint={t("workoutCard.openHint")}
          accessibilityLabel={`${workout.name}, ${exerciseCount}`}
          accessibilityRole="button"
          className="gap-3 active:opacity-70"
          onPress={openWorkout}
        >
          <View className="gap-xs flex-row items-center">
            <Text className="text-headline-emphasized flex-1">
              {workout.name}
            </Text>
            <Text className="text-footnote text-muted-foreground">
              {exerciseCount}
            </Text>
            <SymbolImage
              className="text-footnote-emphasized text-muted-foreground"
              name="chevron.right"
            />
          </View>
          {thumbnails.length > 0 ? (
            <View className="gap-xs flex-row">
              {thumbnails.map(({ exercise_slug, id }) => (
                <ExerciseImage
                  exercise={
                    shownBySlug[exercise_slug] ??
                    shownExercise(exercise_slug, null)
                  }
                  key={id}
                  radius={THUMBNAIL_RADIUS}
                  size={THUMBNAIL_SIZE}
                />
              ))}
              {hiddenCount > 0 ? (
                <ScopedVariables
                  variables={{
                    "--plan-thumbnail-radius": THUMBNAIL_RADIUS,
                    "--plan-thumbnail-size": THUMBNAIL_SIZE,
                  }}
                >
                  <View
                    className="bg-secondary size-(--plan-thumbnail-size) items-center justify-center rounded-(--plan-thumbnail-radius)"
                    testID={PLAN_WORKOUT_MORE}
                  >
                    <Text className="text-mono-subhead text-muted-foreground">
                      {t("plans.more", { count: hiddenCount })}
                    </Text>
                  </View>
                </ScopedVariables>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
};

export default PlanWorkoutRow;
