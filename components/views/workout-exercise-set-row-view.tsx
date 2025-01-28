import React from "react";
import { HStack } from "../ui/hstack";
import WorkoutExerciseSetForm from "../forms/workout-exercise-set-form";
import { WorkoutExerciseSet } from "~/lib/models";
import { useUpdateWorkoutExerciseSetMutation } from "~/hooks/mutations/workout-exercise-sets";
import { VStack } from "../ui/vstack";
import { useQueryClient } from "@tanstack/react-query";

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
    <VStack className="bg-card w-full rounded p-2">
      <WorkoutExerciseSetForm
        disabled={workoutExerciseSet.weight_done !== null}
        defaultValues={{
          weight: workoutExerciseSet.weight_recommended / 1000,
          repeats: workoutExerciseSet.repeats_recommended,
        }}
        onSubmit={async (values) => {
          updateWorkoutExerciseSet({
            id: workoutExerciseSet.id,
            weight_done: values.weight * 1000,
            repeats_done: values.repeats,
          });
        }}
      />
    </VStack>
  );
}
