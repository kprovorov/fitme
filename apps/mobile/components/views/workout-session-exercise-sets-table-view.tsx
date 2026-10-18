import type { SetResult, WorkoutSessionExerciseSet } from "@fitme/core";
import { getWeightLabel } from "@fitme/core";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { cn } from "~/lib/utils";
import { SET_TABLE_MAX_FONT_SCALE } from "../forms/workout-exercise-set-form";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { VStack } from "../ui/vstack";
import WorkoutSessionExerciseSetRowView from "./workout-session-exercise-set-row-view";

interface WorkoutSessionExerciseSetsTableViewProps {
  exerciseId: string;
  /**
   * A set was logged for the first time; `nextSetOrder` is the next set still
   * to log (an added one included), or `null` when none is left.
   */
  onSetLogged?: (
    set: WorkoutSessionExerciseSet,
    nextSetOrder: number | null
  ) => void;
  /** The exercise's previous session, by set order. */
  previousSets?: Map<number, SetResult>;
  readOnly?: boolean;
  sessionId: string;
  workoutSessionExerciseSets: WorkoutSessionExerciseSet[];
}

interface LocalSet {
  id: string;
  order: number;
}

function ColumnLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text
      adjustsFontSizeToFit
      className={cn(
        "font-nunito-sans-bold text-caption-1 text-muted-foreground uppercase",
        className
      )}
      maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

export default function WorkoutSessionExerciseSetsTableView({
  exerciseId,
  onSetLogged,
  previousSets,
  workoutSessionExerciseSets,
  readOnly = false,
  sessionId,
}: WorkoutSessionExerciseSetsTableViewProps) {
  const { data: profile, isPending: isProfilePending } = useProfileQuery();
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

  const handleSetLogged = (set: WorkoutSessionExerciseSet) => {
    const pendingOrders = [
      ...workoutSessionExerciseSets
        .filter((other) => other.id !== set.id && other.reps_completed === null)
        .map((other) => other.order),
      ...localSets
        .filter((local) => local.order !== set.order)
        .map((local) => local.order),
    ];
    onSetLogged?.(
      set,
      pendingOrders.length > 0 ? Math.min(...pendingOrders) : null
    );
  };

  const handleSetCreated = (localId?: string) => {
    if (!localId) {
      return;
    }
    setLocalSets(localSets.filter((set) => set.id !== localId));
  };

  return (
    !isProfilePending && (
      <VStack className="items-stretch gap-1">
        <View
          accessibilityElementsHidden
          className="flex-row items-center gap-2 pt-1 pr-1 pl-2"
          importantForAccessibility="no-hide-descendants"
        >
          <ColumnLabel className="w-7">Set</ColumnLabel>
          <ColumnLabel className="flex-1">Previous</ColumnLabel>
          {hasWeight && (
            <ColumnLabel className="w-18 text-center">
              {getWeightLabel(profile?.measurement_system ?? "metric")}
            </ColumnLabel>
          )}
          <ColumnLabel className="w-18 text-center">Reps</ColumnLabel>
          <View className="w-11" />
        </View>

        {[...workoutSessionExerciseSets]
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
                onSetLogged={handleSetLogged}
                previous={previousSets?.get(workoutSessionExerciseSet.order)}
                sessionId={sessionId}
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
                onSetLogged={handleSetLogged}
                order={localSet.order}
                previous={previousSets?.get(localSet.order)}
                sessionId={sessionId}
                workoutSessionExerciseSet={null}
              />
            );
          })}

        {!readOnly && (
          <VStack className="items-stretch pt-1">
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
