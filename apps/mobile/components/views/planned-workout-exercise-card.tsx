import type { WorkoutExercise } from "@fitme/core";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Card } from "~/components/ui/card";
import { type ShownExercise, shownExercise } from "~/hooks/queries/library";
import ExerciseCardHeader, { OpenChevron } from "./exercise-card-header";
import WorkoutExerciseSetsTableView from "./workout-exercise-sets-table-view";

interface PlannedWorkoutExerciseCardProps {
  /** The Exercise as resolved by `useExercises`. */
  exercise: ShownExercise | undefined;
  workoutExercise: WorkoutExercise;
}

/**
 * The Workout Session Exercise card's planned variant: a Workout Exercise
 * read-only, its sets' targets and rest, with no inputs, no Add Set and no
 * menu. The Exercise opens its detail once the Library resolved it.
 */
export default function PlannedWorkoutExerciseCard({
  exercise: resolved,
  workoutExercise,
}: PlannedWorkoutExerciseCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const exercise =
    resolved ?? shownExercise(workoutExercise.exercise_slug, null);

  return (
    <Card className="gap-sm">
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
      <WorkoutExerciseSetsTableView sets={workoutExercise.sets} />
    </Card>
  );
}
