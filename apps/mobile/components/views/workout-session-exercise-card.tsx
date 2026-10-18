import {
  type ExerciseProgress,
  exerciseProgress,
  formatRepRange,
  type WorkoutSessionExercise,
} from "@fitme/core";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";
import ExerciseImage from "../exercises/exercise-image";

interface WorkoutSessionExerciseCardProps {
  onDelete?: () => void;
  onReplace?: () => void;
  planId: string | null;
  sessionId: string;
  workoutId: string | null;
  workoutSessionExercise: WorkoutSessionExercise;
}

/** The row's second line: progress in words, so it never relies on color. */
function progressText(
  { logged, state, total }: ExerciseProgress,
  repRange: string | null
): string {
  if (state === "done") {
    return `${logged} of ${total} sets logged`;
  }
  if (state === "in-progress") {
    return `Set ${logged + 1} of ${total} · in progress`;
  }
  if (total === 0) {
    return "No sets yet";
  }
  const sets = total === 1 ? "1 set" : `${total} sets`;
  return repRange ? `${sets} · ${repRange} reps` : sets;
}

const INDICATOR = {
  done: { className: "text-primary", name: "checkmark.circle.fill" },
  "in-progress": { className: "text-primary", name: "circle.inset.filled" },
  todo: { className: "text-muted-foreground/60", name: "circle" },
} as const;

export default function WorkoutSessionExerciseCard({
  workoutSessionExercise,
  onDelete,
  onReplace,
  planId,
  workoutId,
  sessionId,
}: WorkoutSessionExerciseCardProps) {
  const router = useRouter();
  const progress = exerciseProgress(workoutSessionExercise.sets);
  const indicator = INDICATOR[progress.state];

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
    <View
      className={cn(
        "flex-row items-center gap-2 pr-3",
        progress.state === "in-progress" && "bg-primary/10"
      )}
    >
      <Pressable
        accessibilityRole="button"
        className="flex-1 flex-row items-center gap-3 py-3 pl-sm active:opacity-80"
        disabled={!canOpen}
        onPress={handlePress}
      >
        <ExerciseImage
          exercise={workoutSessionExercise.exercise}
          radius={12}
          size={52}
        />
        <View className="flex-1 gap-0.5">
          <Text className="font-nunito-sans-semibold text-body">
            {workoutSessionExercise.exercise.name}
          </Text>
          <Text
            className={cn(
              "text-subhead",
              progress.state === "in-progress"
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            {progressText(
              progress,
              formatRepRange(workoutSessionExercise.sets)
            )}
          </Text>
        </View>
        <SymbolImage
          className={indicator.className}
          name={indicator.name}
          size={24}
        />
      </Pressable>
      {menuItems.length > 0 ? (
        <DropdownMenu
          accessibilityLabel={`More options for ${workoutSessionExercise.exercise.name}`}
          items={menuItems}
          systemImage="ellipsis"
        />
      ) : (
        <SymbolImage
          className="text-muted-foreground/60"
          name="chevron.right"
          size={14}
        />
      )}
    </View>
  );
}
