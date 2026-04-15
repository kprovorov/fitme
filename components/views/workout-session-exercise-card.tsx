import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import ContextMenu from "react-native-context-menu-view";
import { Text } from "~/components/ui/text";
import { Ellipsis } from "~/lib/icons/Ellipsis";
import type { WorkoutSessionExercise } from "~/lib/models";
import { cn } from "~/lib/utils";
import ExerciseImage from "../exercises/exercise-image";
import { Button } from "../ui/button";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";

interface WorkoutSessionExerciseCardProps {
  onDelete?: () => void;
  onReplace?: () => void;
  planId: string;
  sessionId: string;
  workoutId: string;
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
    router.push(
      `/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${workoutSessionExercise.id}`
    );
  };

  const contextMenuActions = [
    ...(onReplace
      ? [
          {
            title: "Replace",
            systemIcon: "arrow.triangle.2.circlepath",
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            title: "Delete",
            systemIcon: "trash",
            destructive: true,
          },
        ]
      : []),
  ];

  return (
    <Pressable className="active:opacity-80" onPress={handlePress}>
      <HStack className="w-full items-center justify-between gap-sm px-sm">
        <ExerciseImage exercise={workoutSessionExercise.exercise} />
        <VStack className="flex-1 items-start gap-0">
          <Text className="font-bold">
            {workoutSessionExercise.exercise.name}
          </Text>
          <Text
            className={cn(
              "font-bold text-sm",
              setsDoneCount >= workoutSessionExercise.sets.length
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <Text
              className={cn(
                "font-bold text-sm",
                setsDoneCount === 0 ? "text-muted-foreground" : "text-primary"
              )}
            >
              {setsDoneCount}
            </Text>{" "}
            / {workoutSessionExercise.sets.length}
          </Text>
        </VStack>
        {contextMenuActions.length > 0 && (
          <ContextMenu
            actions={contextMenuActions}
            dropdownMenuMode
            onPress={(e) => {
              if (e.nativeEvent.name === "Replace") {
                onReplace?.();
              } else if (e.nativeEvent.name === "Delete") {
                onDelete?.();
              }
            }}
          >
            <Button shape="pill" size="icon-sm" variant="ghost">
              <Text>
                <Ellipsis className="text-foreground" size={24} />
              </Text>
            </Button>
          </ContextMenu>
        )}
      </HStack>
    </Pressable>
  );
}
