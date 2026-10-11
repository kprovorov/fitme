import type { WorkoutSessionExerciseSet } from "@fitme/core";
import { getWeightLabel } from "@fitme/core";
import { useState } from "react";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { Button } from "../ui/button";
import { HStack } from "../ui/hstack";
import { Separator } from "../ui/separator";
import { Text } from "../ui/text";
import { VStack } from "../ui/vstack";
import WorkoutSessionExerciseSetRowView from "./workout-session-exercise-set-row-view";

interface WorkoutSessionExerciseSetsTableViewProps {
  exerciseId: string;
  readOnly?: boolean;
  sessionId: string;
  workoutSessionExerciseSets: WorkoutSessionExerciseSet[];
}

interface LocalSet {
  id: string;
  order: number;
}

export default function WorkoutSessionExerciseSetsTableView({
  exerciseId,
  workoutSessionExerciseSets,
  readOnly = false,
  sessionId,
}: WorkoutSessionExerciseSetsTableViewProps) {
  const { data: profile } = useProfileQuery();
  const [localSets, setLocalSets] = useState<LocalSet[]>([]);

  const hasWeight = workoutSessionExerciseSets.some(
    (set) => set.weight_recommended !== null
  );

  const maxOrder = Math.max(
    ...workoutSessionExerciseSets.map((set) => set.order),
    0
  );

  const handleAddSet = () => {
    const newOrder = maxOrder + localSets.length + 1;
    const newLocalSet: LocalSet = {
      id: `local-${Date.now()}-${newOrder}`,
      order: newOrder,
    };
    setLocalSets([...localSets, newLocalSet]);
  };

  const handleSetCreated = (localId?: string) => {
    if (!localId) {
      return;
    }
    setLocalSets(localSets.filter((set) => set.id !== localId));
  };

  return (
    profile !== undefined && (
      <VStack className="items-stretch gap-0">
        <HStack className="justify-start py-2 pr-12">
          <Text className="w-12 text-center font-bold text-primary text-subhead uppercase">
            Set
          </Text>
          {hasWeight && (
            <Text className="flex-1 text-center font-bold text-primary text-subhead uppercase">
              {getWeightLabel(profile?.measurement_system ?? "metric")}
            </Text>
          )}
          <Text className="flex-1 text-center font-bold text-primary text-subhead uppercase">
            Reps
          </Text>
        </HStack>

        <Separator />

        {workoutSessionExerciseSets
          .sort((a, b) => a.order - b.order)
          .map((workoutSessionExerciseSet, index, sorted) => {
            const locked = sorted
              .slice(0, index)
              .some((s) => s.reps_completed === null);
            return (
              <WorkoutSessionExerciseSetRowView
                exerciseId={exerciseId}
                hasWeight={hasWeight}
                key={workoutSessionExerciseSet.id}
                locked={locked}
                sessionId={sessionId}
                timer={false}
                workoutSessionExerciseSet={workoutSessionExerciseSet}
              />
            );
          })}

        {!readOnly &&
          localSets.map((localSet, index) => {
            const allExistingDone = workoutSessionExerciseSets.every(
              (s) => s.reps_completed !== null
            );
            const locked = !allExistingDone || index > 0;
            return (
              <WorkoutSessionExerciseSetRowView
                exerciseId={exerciseId}
                hasWeight={hasWeight}
                key={localSet.id}
                localSetId={localSet.id}
                locked={locked}
                onSetCreated={handleSetCreated}
                order={localSet.order}
                sessionId={sessionId}
                timer={false}
                workoutSessionExerciseSet={null}
              />
            );
          })}

        {!readOnly && (
          <VStack className="items-stretch py-3">
            <Button
              label="Add Set"
              onPress={handleAddSet}
              shape="pill"
              size="sm"
              systemImage="plus"
              variant="ghost"
            />
          </VStack>
        )}
      </VStack>
    )
  );
}
