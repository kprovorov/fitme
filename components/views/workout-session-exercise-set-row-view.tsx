import React, { useState } from "react";
import { HStack } from "../ui/hstack";
import WorkoutSessionExerciseSetForm from "../forms/workout-exercise-set-form";
import { WorkoutSessionExerciseSet } from "~/lib/models";
import { useQueryClient } from "@tanstack/react-query";
import { Text } from "../ui/text";
import { Check } from "lucide-react-native";
import {
  useUpdateWorkoutSessionExerciseSetMutation,
  useCreateWorkoutSessionExerciseSetMutation,
} from "~/hooks/queries/workout-session-exercise-sets";
import { Separator } from "../ui/separator";
import { ClockFading } from "~/lib/icons/ClockFading";
import { cn } from "~/lib/utils";

interface WorkoutSessionExerciseSetRowViewProps {
  exerciseId: string;
  workoutSessionExerciseSet: WorkoutSessionExerciseSet | null;
  localSetId?: string;
  order?: number;
  hasWeight?: boolean;
  timer?: boolean;
  onSetCreated?: () => void;
}

export default function WorkoutSessionExerciseSetRowView({
  exerciseId,
  workoutSessionExerciseSet,
  localSetId,
  order,
  hasWeight = true,
  timer = true,
  onSetCreated,
}: WorkoutSessionExerciseSetRowViewProps) {
  const queryClient = useQueryClient();
  const isNewSet = workoutSessionExerciseSet === null;

  const [isEditable, setIsEditable] = useState(
    isNewSet || workoutSessionExerciseSet.weight_completed === null,
  );
  const [isDone, setIsDone] = useState(
    !isNewSet && workoutSessionExerciseSet.weight_completed !== null,
  );

  const { mutate: updateWorkoutSessionExerciseSet } =
    useUpdateWorkoutSessionExerciseSetMutation({
      onSuccess: () => {
        setIsEditable(false);
        setIsDone(true);
        queryClient.invalidateQueries({
          queryKey: ["workout-session-exercise"],
        });
        queryClient.invalidateQueries({
          queryKey: ["workout-session"],
        });
        queryClient.invalidateQueries({
          queryKey: ["exercise-history"],
        });
      },
    });

  const { mutate: createWorkoutSessionExerciseSet } =
    useCreateWorkoutSessionExerciseSetMutation({
      onSuccess: () => {
        setIsEditable(false);
        setIsDone(true);
        queryClient.invalidateQueries({
          queryKey: ["workout-session-exercise"],
        });
        queryClient.invalidateQueries({
          queryKey: ["workout-session"],
        });
        queryClient.invalidateQueries({
          queryKey: ["exercise-history"],
        });
        onSetCreated?.();
      },
    });

  const setOrder = isNewSet ? order! : workoutSessionExerciseSet.order;
  const weightRecommended = isNewSet
    ? 0
    : (workoutSessionExerciseSet.weight_recommended ?? 0);
  const repsRecommended = isNewSet
    ? 0
    : (workoutSessionExerciseSet.reps_recommended ?? 0);
  const weightCompleted = isNewSet
    ? null
    : workoutSessionExerciseSet.weight_completed;
  const repsCompleted = isNewSet
    ? null
    : workoutSessionExerciseSet.reps_completed;
  const restRecommended = isNewSet
    ? null
    : workoutSessionExerciseSet.rest_recommended;

  return (
    <HStack className="py-sm justify-start">
      {isDone ? (
        <HStack className="w-12">
          <Check strokeWidth={3} size={16} className="text-primary" />
        </HStack>
      ) : (
        <Text className="w-12 font-bold text-center">#{setOrder}</Text>
      )}

      <WorkoutSessionExerciseSetForm
        disabled={!isEditable}
        hasWeight={hasWeight}
        isDone={isDone}
        onEdit={() => setIsEditable(true)}
        isEditing={isEditable}
        setIndex={setOrder}
        recommendedValues={{
          weight: (weightCompleted ?? weightRecommended)
            .toFixed(2)
            .replace(".00", "")
            .replace(".", ","),
          reps: (repsCompleted ?? repsRecommended).toString(),
        }}
        onSubmit={async (values) => {
          const weight_completed = values.weight
            ? Number(values.weight.replace(",", "."))
            : weightRecommended;
          const reps_completed = values.reps
            ? Number(values.reps)
            : repsRecommended;

          if (isNewSet) {
            createWorkoutSessionExerciseSet({
              data: {
                weight_completed,
                reps_completed,
              },
              params: {
                exerciseId,
              },
            });
          } else {
            updateWorkoutSessionExerciseSet({
              data: {
                weight_completed,
                reps_completed,
              },
              params: {
                setId: workoutSessionExerciseSet.id,
              },
            });
          }
        }}
      />

      <HStack className={cn("absolute h-6 inset-x-0 -bottom-3 gap-1")}>
        <Separator className={cn("flex-1", timer && "bg-primary")} />
        {!!restRecommended && (
          <>
            <HStack
              className={cn(
                "gap-1 px-1.5 h-6 rounded-full",
                timer && "bg-primary",
              )}
            >
              <ClockFading
                size={12}
                className={cn(
                  timer ? "text-primary-foreground" : "text-muted-foreground",
                )}
              />
              <Text
                className={cn(
                  "text-xs",
                  timer ? "text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {restRecommended}s
              </Text>
            </HStack>
            <Separator className={cn("flex-1", timer && "bg-primary")} />
          </>
        )}
      </HStack>
    </HStack>
  );
}
