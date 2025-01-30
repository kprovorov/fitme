import React from "react";
import { HStack } from "../ui/hstack";
import WorkoutExerciseSetForm from "../forms/workout-exercise-set-form";
import { WorkoutExerciseSet } from "~/lib/models";
import { useUpdateWorkoutExerciseSetMutation } from "~/hooks/mutations/workout-exercise-sets";
import { useQueryClient } from "@tanstack/react-query";
import { Text } from "../ui/text";

interface WorkoutExerciseSetRowViewProps {
  workoutExerciseSet: WorkoutExerciseSet;
}

export default function WorkoutExerciseSetRowView({
  workoutExerciseSet,
}: WorkoutExerciseSetRowViewProps) {
  const queryClient = useQueryClient();

  const { mutate: updateWorkoutExerciseSet } =
    useUpdateWorkoutExerciseSetMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["workout-exercise"],
        });
      },
    });

  return (
    <HStack className="p-2 justify-start">
      <Text className="w-12 font-bold text-center">
        #{workoutExerciseSet.order}
      </Text>
      <WorkoutExerciseSetForm
        disabled={workoutExerciseSet.weight_done !== null}
        defaultValues={{
          weight:
            (workoutExerciseSet.weight_done ??
              workoutExerciseSet.weight_recommended) / 1000,
          repeats:
            workoutExerciseSet.repeats_done ??
            workoutExerciseSet.repeats_recommended,
        }}
        onSubmit={async (values) => {
          updateWorkoutExerciseSet({
            id: workoutExerciseSet.id,
            weight_done: values.weight * 1000,
            repeats_done: values.repeats,
          });
        }}
      />
    </HStack>
  );
}
