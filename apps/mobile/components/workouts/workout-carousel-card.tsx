import type { MuscleGroup, Workout } from "@fitme/core";
import { formatCount } from "@fitme/i18n";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { type ShownExercise, useExercises } from "~/hooks/queries/library";
import { useStartWorkout, workoutSessionPath } from "~/hooks/start-workout";
import { useChoiceLabels } from "~/lib/choices";
import { useI18n } from "~/lib/i18n";
import { SymbolImage } from "../symbol-image";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Text } from "../ui/text";
import { H4 } from "../ui/typography";

/** How many muscle-group badges a card shows before "+N". */
export const SHOWN_MUSCLE_GROUPS = 3;

/**
 * The muscle groups a Workout's Exercises train, the most trained first
 * (counted once per Exercise), ties in the order they're first met. Only
 * Exercises the Library has answered for count, so none show before it has.
 */
export const workoutMuscleGroups = (
  exercises: readonly ShownExercise[]
): MuscleGroup[] => {
  const counts = new Map<MuscleGroup, number>();
  for (const exercise of exercises) {
    if (!exercise.isResolved) {
      continue;
    }
    for (const group of new Set(exercise.muscle_groups)) {
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
  }
  // Map keeps insertion order and `sort` is stable, so ties stay first met.
  return [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([group]) => group);
};

interface WorkoutCarouselCardProps {
  /** The Plan's Workout duration, in minutes. */
  durationMinutes: number;
  workout: Workout;
}

/**
 * A Workout on the Workout tab's carousel (Figma `WorkoutCard`): its muscle
 * groups as badges at the top right, then at the bottom its name, Exercise
 * count and the Plan's duration, Preview (its Workout screen) and Start (a
 * new Workout Session, or its open one, through `useStartWorkout`). The card
 * itself isn't a tap target.
 */
export default function WorkoutCarouselCard({
  durationMinutes,
  workout,
}: WorkoutCarouselCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const i18n = useI18n();
  const labels = useChoiceLabels();
  const { isStarting, startWorkout } = useStartWorkout(
    workout.id,
    (sessionId) => {
      router.push(workoutSessionPath(workout.plan_id, workout.id, sessionId));
    },
    { alertWhenBlocked: true }
  );

  const exercises = [...workout.exercises].sort((a, b) => a.order - b.order);
  const shownBySlug = useExercises(
    exercises.map(({ exercise_slug }) => exercise_slug)
  );
  const muscleGroups = workoutMuscleGroups(
    exercises.flatMap(({ exercise_slug }) => shownBySlug[exercise_slug] ?? [])
  );
  const hiddenGroups = muscleGroups.length - SHOWN_MUSCLE_GROUPS;

  const openPreview = () => {
    router.push(`/plans/${workout.plan_id}/workouts/${workout.id}`);
  };

  return (
    <Card
      // The spec's readability scrim over the Cover (FIT-456), not decoration:
      // the bottom half darkens to the card fill, solid from three quarters
      // down, under the name and buttons.
      background={
        <View className="absolute inset-x-0 top-1/2 bottom-0 bg-linear-to-b from-transparent to-50% to-card/90" />
      }
      className="min-h-100 flex-1"
      padding="none"
      testID={`workout-card-${workout.id}`}
    >
      <View className="flex-1 gap-xs p-sm">
        <View className="flex-row flex-wrap justify-end gap-xs">
          {muscleGroups.slice(0, SHOWN_MUSCLE_GROUPS).map((group) => (
            <Badge key={group} variant="secondary">
              <Text>{labels.muscleGroup(group)}</Text>
            </Badge>
          ))}
          {hiddenGroups > 0 ? (
            <Badge
              accessibilityLabel={t("home.card.moreMuscleGroupsSpoken", {
                count: hiddenGroups,
              })}
              accessible
              variant="muted"
            >
              <Text>
                {t("home.card.moreMuscleGroups", { count: hiddenGroups })}
              </Text>
            </Badge>
          ) : null}
        </View>
        <View className="flex-1 justify-end gap-xs">
          <H4 className="text-primary">{workout.name}</H4>
          <View className="flex-row flex-wrap gap-x-sm">
            <View className="flex-row items-center gap-1">
              <SymbolImage
                className="text-footnote-emphasized text-muted-foreground"
                name="bolt.fill"
              />
              <Text className="text-footnote-emphasized text-muted-foreground">
                {formatCount(i18n, "exercises", workout.exercises.length)}
              </Text>
            </View>
            <View
              accessibilityLabel={formatCount(i18n, "minutes", durationMinutes)}
              accessible
              className="flex-row items-center gap-1"
            >
              <SymbolImage
                className="text-footnote-emphasized text-muted-foreground"
                name="timer"
              />
              <Text className="text-footnote-emphasized text-muted-foreground">
                {t("plannedWorkout.durationMinutes", {
                  minutes: durationMinutes,
                })}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-sm">
            <View className="flex-1">
              <Button
                accessibilityLabel={t("home.card.previewNamed", {
                  name: workout.name,
                })}
                label={t("home.card.preview")}
                onPress={openPreview}
                size="lg"
                variant="secondary"
              />
            </View>
            <View className="flex-1">
              <Button
                accessibilityLabel={t("home.card.startNamed", {
                  name: workout.name,
                })}
                icon="play.circle.fill"
                iconPosition="trailing"
                isLoading={isStarting}
                label={t("home.card.start")}
                onPress={startWorkout}
                size="lg"
              />
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}
