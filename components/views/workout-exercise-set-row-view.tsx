import React, { useState } from "react";
import { HStack } from "../ui/hstack";
import WorkoutExerciseSetForm from "../forms/workout-exercise-set-form";
import { WorkoutExerciseSet } from "~/lib/models";
import { useUpdateWorkoutExerciseSetMutation } from "~/hooks/mutations/workout-exercise-sets";
import { useQueryClient } from "@tanstack/react-query";
import { Text } from "../ui/text";
import { Check } from "lucide-react-native";
import { View } from "react-native";
import { VStack } from "../ui/vstack";

interface WorkoutExerciseSetRowViewProps {
  workoutExerciseSet: WorkoutExerciseSet;
  hasWeight?: boolean;
}

export default function WorkoutExerciseSetRowView({
  workoutExerciseSet,
  hasWeight = true,
}: WorkoutExerciseSetRowViewProps) {
  const queryClient = useQueryClient();

  const [isEditable, setIsEditable] = useState(
    workoutExerciseSet.weight_done === null
  );
  const [isDone, setIsDone] = useState(workoutExerciseSet.weight_done !== null);

  const { mutate: updateWorkoutExerciseSet } =
    useUpdateWorkoutExerciseSetMutation({
      onSuccess: () => {
        setIsEditable(false);
        setIsDone(true);
        queryClient.invalidateQueries({
          queryKey: ["workout-exercise"],
        });
        queryClient.invalidateQueries({
          queryKey: ["workout"],
        });
      },
    });

  return (
    <HStack className="p-2 justify-start">
      {isDone ? (
        <HStack className="w-12">
          <Check strokeWidth={3} size={16} className="text-primary" />
        </HStack>
      ) : (
        <Text className="w-12 font-bold text-center">
          #{workoutExerciseSet.order}
        </Text>
      )}

      <WorkoutExerciseSetForm
        disabled={!isEditable}
        hasWeight={hasWeight}
        isDone={isDone}
        onEdit={() => setIsEditable(true)}
        isEditing={isEditable}
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
