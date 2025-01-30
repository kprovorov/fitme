import { WorkoutExercise } from "~/lib/models";
import { H4, P } from "../ui/typography";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";
import { Text } from "~/components/ui/text";

interface WorkoutExerciseCardProps {
  workoutExercise: WorkoutExercise;
}

export default function WorkoutExerciseCard({
  workoutExercise,
}: WorkoutExerciseCardProps) {
  const setsDoneCount = workoutExercise.sets.filter(
    (set) => set.weight_done !== null
  ).length;

  const isDone = setsDoneCount >= workoutExercise.sets.length;

  return (
    <VStack className="items-stretch border rounded p-4 border-border w-full">
      <HStack className="justify-between items-baseline">
        <H4 className="text-primary flex-1">{workoutExercise.exercise.name}</H4>
        <HStack
          className={`w-12 border-2 border-primary rounded-md p-1 gap-0 ${
            isDone ? "bg-primary/50" : ""
          }`}
        >
          <Text className="text-center font-bold">{setsDoneCount}</Text>
          <Text className="text-center font-bold text-primary">
            /{workoutExercise.sets.length}
          </Text>
        </HStack>
      </HStack>
      <P>{workoutExercise.exercise.description}</P>
    </VStack>
  );
}
