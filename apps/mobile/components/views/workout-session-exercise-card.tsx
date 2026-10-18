import type { WorkoutSessionExercise } from "@fitme/core";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";
import ExerciseImage from "../exercises/exercise-image";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";

interface WorkoutSessionExerciseCardProps {
  onDelete?: () => void;
  onReplace?: () => void;
  planId: string | null;
  sessionId: string;
  workoutId: string | null;
  workoutSessionExercise: WorkoutSessionExercise;
}

export default function WorkoutSessionExerciseCard({
  workoutSessionExercise,
  onDelete,
  onReplace,
  planId,
  workoutId,
  sessionId,
}: WorkoutSessionExerciseCardProps) {
  const router = useRouter();
  const setsDoneCount = workoutSessionExercise.sets.filter(
    (set) => set.reps_completed !== null
  ).length;

  const handlePress = () => {
    if (!(planId && workoutId)) {
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
    <HStack className="w-full items-center justify-between gap-sm px-sm">
      <Pressable
        className="flex-1 flex-row items-center gap-sm active:opacity-80"
        onPress={handlePress}
      >
        <ExerciseImage exercise={workoutSessionExercise.exercise} />
        <VStack className="flex-1 items-start gap-0">
          <Text className="font-bold">
            {workoutSessionExercise.exercise.name}
          </Text>
          <Text
            className={cn(
              "font-bold text-subhead",
              setsDoneCount >= workoutSessionExercise.sets.length
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <Text
              className={cn(
                "font-bold text-subhead",
                setsDoneCount === 0 ? "text-muted-foreground" : "text-primary"
              )}
            >
              {setsDoneCount}
            </Text>{" "}
            / {workoutSessionExercise.sets.length}
          </Text>
        </VStack>
      </Pressable>
      {menuItems.length > 0 && (
        <DropdownMenu
          accessibilityLabel={`More options for ${workoutSessionExercise.exercise.name}`}
          items={menuItems}
          systemImage="ellipsis"
        />
      )}
    </HStack>
  );
}
