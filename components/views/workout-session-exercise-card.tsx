import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { Text } from "~/components/ui/text";
import type { WorkoutSessionExercise } from "~/lib/models";
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
            systemImage: "arrow.triangle.2.circlepath" as const,
            onPress: onReplace,
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            label: "Delete",
            systemImage: "trash" as const,
            destructive: true,
            onPress: onDelete,
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
        <DropdownMenu items={menuItems} systemImage="ellipsis" />
      )}
    </HStack>
  );
}
