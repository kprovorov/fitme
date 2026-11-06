import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Card } from "~/components/ui/card";
import { shownExercise } from "~/hooks/queries/library";
import type { ShownExercise } from "~/hooks/queries/library";
import type { FullPlan, PlanExercise } from "~/hooks/queries/plans";

import ExerciseCardHeader, { OpenChevron } from "./exercise-card-header";
import WorkoutExerciseSetsTableView from "./workout-exercise-sets-table-view";

interface PlannedWorkoutExerciseCardProps {
  /** The Exercise as resolved by `useExercises`. */
  exercise: ShownExercise | undefined;
  /** The unit its sets' weights are in, from the Plan's own read. */
  weightUnit: FullPlan["weight_unit"];
  workoutExercise: PlanExercise;
}

/**
 * The Workout Session Exercise card's planned variant: a Workout Exercise
 * read-only, its sets' targets and rest, with no inputs, no Add Set and no
 * menu. The Exercise opens its detail once the Library resolved it.
 */
const PlannedWorkoutExerciseCard = ({
  exercise: resolved,
  weightUnit,
  workoutExercise,
}: PlannedWorkoutExerciseCardProps) => {
  const router = useRouter();
  const { t } = useTranslation();

  const exercise =
    resolved ?? shownExercise(workoutExercise.exercise_slug, null);

  return (
    <Card>
      <View className="gap-sm">
        <ExerciseCardHeader
          accessibilityHint={t("plannedWorkout.exerciseDetailsHint")}
          exercise={exercise}
          onPress={
            exercise.isResolved
              ? () => router.push(`/exercises/${exercise.slug}`)
              : undefined
          }
          trailing={exercise.isResolved && <OpenChevron />}
        />
        <WorkoutExerciseSetsTableView
          sets={workoutExercise.sets}
          weightUnit={weightUnit}
        />
      </View>
    </Card>
  );
};

export default PlannedWorkoutExerciseCard;
