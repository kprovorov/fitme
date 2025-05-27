import React from "react";
import { WorkoutSessionExerciseSet } from "~/lib/models";
import { VStack } from "../ui/vstack";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import WorkoutSessionExerciseSetRowView from "./workout-session-exercise-set-row-view";
import { getWeightLabel } from "~/lib/labels";
import { Separator } from "../ui/separator";
import { Muted } from "../ui/typography";

interface WorkoutSessionExerciseSetsTableViewProps {
  planId: number;
  workoutId: number;
  sessionId: number;
  exerciseId: number;
  workoutSessionExerciseSets: WorkoutSessionExerciseSet[];
}

export default function WorkoutSessionExerciseSetsTableView({
  planId,
  workoutId,
  sessionId,
  exerciseId,
  workoutSessionExerciseSets,
}: WorkoutSessionExerciseSetsTableViewProps) {
  const { data: user } = useCurrentUserQuery();

  const hasWeight = workoutSessionExerciseSets.some(
    (set) => set.weight_recommended > 0,
  );

  return (
    user && (
      <VStack className="items-stretch gap-0">
        <HStack className="justify-start py-2 pr-12">
          <Text className="w-12 font-bold text-center text-primary uppercase text-sm">
            Set
          </Text>
          {hasWeight && (
            <Text className="flex-1 font-bold text-primary uppercase text-sm text-center">
              {getWeightLabel(user.measurement_system)}
            </Text>
          )}
          <Text className="flex-1 font-bold text-primary uppercase text-sm text-center">
            Reps
          </Text>
        </HStack>

        <Separator />

        {workoutSessionExerciseSets
          .sort((a, b) => a.order - b.order)
          .map((workoutSessionExerciseSet, i) => (
            <WorkoutSessionExerciseSetRowView
              key={workoutSessionExerciseSet.id}
              planId={planId}
              workoutId={workoutId}
              sessionId={sessionId}
              exerciseId={exerciseId}
              workoutSessionExerciseSet={workoutSessionExerciseSet}
              hasWeight={hasWeight}
              timer={false}
            />
          ))}
      </VStack>
    )
  );
}
