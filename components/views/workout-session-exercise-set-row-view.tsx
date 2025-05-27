import React, { useState } from "react";
import { HStack } from "../ui/hstack";
import WorkoutSessionExerciseSetForm from "../forms/workout-exercise-set-form";
import { WorkoutSessionExerciseSet } from "~/lib/models";
import { useQueryClient } from "@tanstack/react-query";
import { Text } from "../ui/text";
import { Check } from "lucide-react-native";
import { useUpdateWorkoutSessionExerciseSetMutation } from "~/hooks/queries/workout-session-exercise-sets";
import { Separator } from "../ui/separator";
import { Muted } from "../ui/typography";
import { ClockFading } from "~/lib/icons/ClockFading";
import { View } from "react-native";
import { cn } from "~/lib/utils";

interface WorkoutSessionExerciseSetRowViewProps {
  planId: number;
  workoutId: number;
  sessionId: number;
  exerciseId: number;
  workoutSessionExerciseSet: WorkoutSessionExerciseSet;
  hasWeight?: boolean;
  timer?: boolean;
}

export default function WorkoutSessionExerciseSetRowView({
  planId,
  workoutId,
  sessionId,
  exerciseId,
  workoutSessionExerciseSet,
  hasWeight = true,
  timer = true,
}: WorkoutSessionExerciseSetRowViewProps) {
  const queryClient = useQueryClient();

  const [isEditable, setIsEditable] = useState(
    workoutSessionExerciseSet.weight_completed === null,
  );
  const [isDone, setIsDone] = useState(
    workoutSessionExerciseSet.weight_completed !== null,
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
      },
    });

  return (
    <HStack className="py-sm justify-start">
      {isDone ? (
        <HStack className="w-12">
          <Check strokeWidth={3} size={16} className="text-primary" />
        </HStack>
      ) : (
        <Text className="w-12 font-bold text-center">
          #{workoutSessionExerciseSet.order}
        </Text>
      )}

      <WorkoutSessionExerciseSetForm
        disabled={!isEditable}
        hasWeight={hasWeight}
        isDone={isDone}
        onEdit={() => setIsEditable(true)}
        isEditing={isEditable}
        recommendedValues={{
          weight: (
            workoutSessionExerciseSet.weight_completed ??
            workoutSessionExerciseSet.weight_recommended
          )
            .toFixed(2)
            .replace(".00", "")
            .replace(".", ","),
          reps: (
            workoutSessionExerciseSet.reps_completed ??
            workoutSessionExerciseSet.reps_recommended
          ).toString(),
        }}
        onSubmit={async (values) => {
          updateWorkoutSessionExerciseSet({
            data: {
              weight_completed: Number(values.weight.replace(",", ".")),
              reps_completed: Number(values.reps),
            },
            params: {
              planId,
              workoutId,
              sessionId,
              exerciseId,
              setId: workoutSessionExerciseSet.id,
            },
          });
        }}
      />

      <HStack className={cn("absolute inset-x-0 -bottom-3 gap-1")}>
        <Separator className={cn("flex-1", timer && "bg-primary")} />
        <HStack
          className={cn("gap-1 px-1.5 h-6 rounded-full", timer && "bg-primary")}
        >
          <ClockFading
            size={12}
            className={cn(
              timer ? "text-primary-foreground" : "text-muted-foreground"
            )}
          />
          <Text
            className={cn(
              "text-xs",
              timer ? "text-primary-foreground" : "text-muted-foreground"
            )}
          >
            {workoutSessionExerciseSet.rest_recommended}s
          </Text>
        </HStack>
        <Separator className={cn("flex-1", timer && "bg-primary")} />
      </HStack>
    </HStack>
  );
}
