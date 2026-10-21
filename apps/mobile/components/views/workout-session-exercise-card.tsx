import { muscleGroupToName, type WorkoutSessionExercise } from "@fitme/core";
import { useRouter } from "expo-router";
import { Pressable, useWindowDimensions, View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { Card } from "~/components/ui/card";
import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { Text } from "~/components/ui/text";
import ExerciseImage from "../exercises/exercise-image";
import WorkoutSessionExerciseSetsTableView from "./workout-session-exercise-sets-table-view";

/** Past this text scale the thumbnail goes above the name instead of beside it. */
const STACKED_FONT_SCALE = 1.4;

interface WorkoutSessionExerciseCardProps {
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
  workoutSessionExercise,
  onDelete,
  onReplace,
  planId,
  readOnly,
  workoutId,
  sessionId,
}: WorkoutSessionExerciseCardProps) {
  const router = useRouter();
  const { exercise } = workoutSessionExercise;
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACKED_FONT_SCALE;

  // The exercise screen lives under the session's plan and workout.
  const canOpen = !!(planId && workoutId);

  const handlePress = () => {
    if (!canOpen) {
      return;
    }
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
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityHint={canOpen ? "Opens the exercise" : undefined}
          accessibilityRole="button"
          className={
            stacked
              ? "flex-1 gap-sm active:opacity-80"
              : "flex-1 flex-row items-center gap-sm active:opacity-80"
          }
          disabled={!canOpen}
          onPress={handlePress}
        >
          <ExerciseImage exercise={exercise} radius={10} size={50} />
          <View className={stacked ? "gap-1" : "flex-1 gap-1"}>
            <Text className="text-body-emphasized">{exercise.name}</Text>
            {exercise.muscle_groups.length > 0 && (
              <Text className="text-footnote text-muted-foreground">
                {exercise.muscle_groups.map(muscleGroupToName).join(", ")}
              </Text>
            )}
          </View>
        </Pressable>
        {menuItems.length > 0 ? (
          <DropdownMenu
            accessibilityLabel={`More options for ${exercise.name}`}
            items={menuItems}
            systemImage="ellipsis"
          />
        ) : (
          canOpen && (
            <SymbolImage
              className="text-muted-foreground/60"
              name="chevron.right"
              size={14}
            />
          )
        )}
      </View>
      <WorkoutSessionExerciseSetsTableView
        exerciseId={workoutSessionExercise.id}
        readOnly={readOnly}
        sessionId={sessionId}
        workoutSessionExerciseSets={workoutSessionExercise.sets}
      />
    </Card>
  );
}
