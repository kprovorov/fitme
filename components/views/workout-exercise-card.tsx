import { WorkoutExercise } from "~/lib/models";
import { H4, P } from "../ui/typography";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";
import { Text } from "~/components/ui/text";
import { PieChart } from "react-native-gifted-charts";

interface WorkoutExerciseCardProps {
  workoutExercise: WorkoutExercise;
}

export default function WorkoutExerciseCard({
  workoutExercise,
}: WorkoutExerciseCardProps) {
  const setsDoneCount = workoutExercise.sets.filter(
    (set) => set.weight_done !== null
  ).length;

  const data = [
    {
      value: setsDoneCount,
      color: "#97DE71",
    },
    {
      value: workoutExercise.sets.length - setsDoneCount,
      color: "#4B5348",
    },
  ];

  return (
    <HStack className="bg-black rounded-md items-start p-4 border-border">
      <PieChart
        data={data}
        radius={30}
        donut
        innerRadius={26}
        innerCircleColor="#000"
        centerLabelComponent={() => (
          <HStack className="gap-0">
            <Text className="font-bold text-2xl">{setsDoneCount}</Text>
            <Text className="text-muted-foreground text-2xl">/</Text>
            <Text className="font-bold text-primary text-2xl">
              {workoutExercise.sets.length}
            </Text>
          </HStack>
        )}
      />
      <VStack className="flex-1 gap-0 items-start">
        <H4 className="text-primary">{workoutExercise.exercise.name}</H4>
        <P>{workoutExercise.exercise.description}</P>
      </VStack>
    </HStack>
  );
}
