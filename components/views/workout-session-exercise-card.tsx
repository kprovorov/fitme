import { WorkoutSessionExercise } from "~/lib/models";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";
import { Text } from "~/components/ui/text";
import ExerciseImage from "../exercises/exercise-image";
import { ChevronRightIcon } from "lucide-react-native";
import { cn } from "~/lib/utils";

interface WorkoutSessionExerciseCardProps {
  workoutSessionExercise: WorkoutSessionExercise;
}

export default function WorkoutSessionExerciseCard({
  workoutSessionExercise,
}: WorkoutSessionExerciseCardProps) {
  const setsDoneCount = workoutSessionExercise.sets.filter(
    (set) => set.weight_completed !== null,
  ).length;

  return (
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
      <ChevronRightIcon size={24} color="white" />
    </HStack>
  );
}
