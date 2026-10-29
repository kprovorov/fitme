import type { WorkoutSessionExercise } from "@fitme/core";
import { useRouter } from "expo-router";
import { Card } from "~/components/ui/card";
import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { type ShownExercise, shownExercise } from "~/hooks/queries/library";
import ExerciseCardHeader, { OpenChevron } from "./exercise-card-header";
import WorkoutSessionExerciseSetsTableView from "./workout-session-exercise-sets-table-view";

interface WorkoutSessionExerciseCardProps {
  /** The Exercise as resolved by `useExercises`. */
  exercise: ShownExercise | undefined;
  onDelete?: () => void;
  onReplace?: () => void;
  planId: string | null;
  /** A finished session: no sets can be added. */
  readOnly: boolean;
  sessionId: string;
  workoutId: string | null;
  workoutSessionExercise: WorkoutSessionExercise;
}

/**
 * An exercise of a workout session: its header (opening the exercise's
 * screen) above its sets, logged right here.
 */
export default function WorkoutSessionExerciseCard({
  exercise: resolved,
  workoutSessionExercise,
  onDelete,
  onReplace,
  planId,
  readOnly,
  workoutId,
  sessionId,
}: WorkoutSessionExerciseCardProps) {
  const router = useRouter();
  const exercise =
    resolved ?? shownExercise(workoutSessionExercise.exercise_slug, null);
  // The exercise screen lives under the session's plan and workout.
  const canOpen = !!(planId && workoutId);

  const handlePress = () => {
    router.push(
      `/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${workoutSessionExercise.id}`
    );
  };

  const menuItems = [
    ...(onReplace
      ? [
          {
            label: "Replace",
            onPress: onReplace,
            systemImage: "arrow.triangle.2.circlepath" as const,
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            destructive: true,
            label: "Delete",
            onPress: onDelete,
            systemImage: "trash" as const,
          },
        ]
      : []),
  ];

  return (
    <Card className="gap-sm">
      <ExerciseCardHeader
        accessibilityHint="Opens the exercise"
        exercise={exercise}
        onPress={canOpen ? handlePress : undefined}
        trailing={
          menuItems.length > 0 ? (
            <DropdownMenu
              accessibilityLabel={`More options for ${exercise.name}`}
              items={menuItems}
              systemImage="ellipsis"
            />
          ) : (
            canOpen && <OpenChevron />
          )
        }
      />
      <WorkoutSessionExerciseSetsTableView
        exerciseId={workoutSessionExercise.id}
        readOnly={readOnly}
        sessionId={sessionId}
        workoutSessionExerciseSets={workoutSessionExercise.sets}
      />
    </Card>
  );
}
