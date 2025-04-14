import React from "react";
import { WorkoutExerciseSet } from "~/lib/models";
import WorkoutExerciseSetRowView from "./workout-exercise-set-row-view";
import { VStack } from "../ui/vstack";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
interface WorkoutExerciseSetsTableViewProps {
  workoutExerciseSets: WorkoutExerciseSet[];
}

export default function WorkoutExerciseSetsTableView({
  workoutExerciseSets,
}: WorkoutExerciseSetsTableViewProps) {
  const { data: user } = useCurrentUserQuery();

  const hasWeight = workoutExerciseSets.some(
    (set) => set.weight_recommended > 0
  );

  return (
    <VStack className="items-stretch w-full gap-0 bg-black/10 rounded-md overflow-hidden">
      <HStack className="justify-start bg-black/20 py-2 pl-2 pr-14">
        <Text className="w-12 font-bold text-center text-primary uppercase text-sm">
          Set
        </Text>
        {hasWeight && (
          <Text className="flex-1 font-bold text-primary uppercase text-sm text-center">
            {user?.measurement_system === "metric" ? "Kg" : "Lbs"}
          </Text>
        )}
        <Text className="flex-1 font-bold text-primary uppercase text-sm text-center">
          Reps
        </Text>
      </HStack>

      {workoutExerciseSets
        .sort((a, b) => a.order - b.order)
        .map((workoutExerciseSet) => (
          <WorkoutExerciseSetRowView
            key={workoutExerciseSet.id}
            workoutExerciseSet={workoutExerciseSet}
            hasWeight={hasWeight}
          />
        ))}
    </VStack>
  );
}
