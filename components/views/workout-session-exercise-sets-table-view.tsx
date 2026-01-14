import React, { useState } from "react";
import { WorkoutSessionExerciseSet } from "~/lib/models";
import { VStack } from "../ui/vstack";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import WorkoutSessionExerciseSetRowView from "./workout-session-exercise-set-row-view";
import { getWeightLabel } from "~/lib/labels";
import { Separator } from "../ui/separator";
import { Muted } from "../ui/typography";
import { Button } from "../ui/button";
import { Plus } from "lucide-react-native";

interface WorkoutSessionExerciseSetsTableViewProps {
  planId: number;
  workoutId: number;
  sessionId: number;
  exerciseId: number;
  workoutSessionExerciseSets: WorkoutSessionExerciseSet[];
}

type LocalSet = {
  id: string;
  isNew: true;
  order: number;
};

export default function WorkoutSessionExerciseSetsTableView({
  planId,
  workoutId,
  sessionId,
  exerciseId,
  workoutSessionExerciseSets,
}: WorkoutSessionExerciseSetsTableViewProps) {
  const { data: user } = useCurrentUserQuery();
  const [localSets, setLocalSets] = useState<LocalSet[]>([]);

  const hasWeight = workoutSessionExerciseSets.some(
    (set) => set.weight_recommended !== null,
  );

  const maxOrder = Math.max(
    ...workoutSessionExerciseSets.map((set) => set.order),
    0,
  );

  const handleAddSet = () => {
    const newOrder = maxOrder + localSets.length + 1;
    const newLocalSet: LocalSet = {
      id: `local-${Date.now()}-${newOrder}`,
      isNew: true,
      order: newOrder,
    };
    setLocalSets([...localSets, newLocalSet]);
  };

  const handleSetCreated = (localId: string) => {
    setLocalSets(localSets.filter((set) => set.id !== localId));
  };

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
          .map((workoutSessionExerciseSet) => (
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

        {localSets.map((localSet) => (
          <WorkoutSessionExerciseSetRowView
            key={localSet.id}
            planId={planId}
            workoutId={workoutId}
            sessionId={sessionId}
            exerciseId={exerciseId}
            workoutSessionExerciseSet={null}
            localSetId={localSet.id}
            order={localSet.order}
            hasWeight={hasWeight}
            timer={false}
            onSetCreated={() => handleSetCreated(localSet.id)}
          />
        ))}

        <VStack className="py-3 items-stretch">
          <Button onPress={handleAddSet} variant="ghost" size="sm" shape="pill">
            <HStack>
              <Plus size={16} className="text-primary" />
              <Text className="text-primary">Add Set</Text>
            </HStack>
          </Button>
        </VStack>
      </VStack>
    )
  );
}
