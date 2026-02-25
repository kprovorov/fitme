import { WorkoutSessionExercise } from "~/lib/models";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";
import { Text } from "~/components/ui/text";
import ExerciseImage from "../exercises/exercise-image";
import { cn } from "~/lib/utils";
import { Ellipsis } from "~/lib/icons/Ellipsis";
import { Button } from "../ui/button";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import ContextMenu from "react-native-context-menu-view";

interface WorkoutSessionExerciseCardProps {
  workoutSessionExercise: WorkoutSessionExercise;
  onDelete?: () => void;
  onReplace?: () => void;
  planId: string;
  workoutId: string;
  sessionId: string;
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
    (set) => set.weight_completed !== null,
  ).length;

  const handlePress = () => {
    router.push(
      `/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${workoutSessionExercise.id}`,
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
    <Pressable onPress={handlePress} className="active:opacity-80">
      <HStack className="w-full items-center justify-between gap-sm px-sm">
        <ExerciseImage exercise={workoutSessionExercise.exercise} />
        <VStack className="flex-1 items-start gap-0">
          <Text className="font-bold">
            {workoutSessionExercise.exercise.name}
          </Text>
          <Text
            className={cn(
              "text-sm font-bold",
              setsDoneCount >= workoutSessionExercise.sets.length
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <Text
              className={cn(
                "text-sm font-bold",
                setsDoneCount === 0 ? "text-muted-foreground" : "text-primary",
              )}
            >
              {setsDoneCount}
            </Text>{" "}
            / {workoutSessionExercise.sets.length}
          </Text>
        </VStack>
        {contextMenuActions.length > 0 && (
          <ContextMenu
            dropdownMenuMode
            actions={contextMenuActions}
            onPress={(e) => {
              if (e.nativeEvent.name === "Replace") {
                onReplace?.();
              } else if (e.nativeEvent.name === "Delete") {
                onDelete?.();
              }
            }}
          >
            <Button variant="ghost" size="icon-sm" shape="pill">
              <Text>
                <Ellipsis size={24} className="text-foreground" />
              </Text>
            </Button>
          </ContextMenu>
        )}
      </HStack>
    </Pressable>
  );
}
