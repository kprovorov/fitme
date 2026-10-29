import type { WorkoutSessionExerciseSet } from "@fitme/core";
import { unitName, weightUnitOf } from "@fitme/i18n";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useProfileQuery } from "~/hooks/queries/profiles";
import type { SavedWorkoutSessionExerciseSet } from "~/hooks/queries/workout-session-exercise-sets";
import { cn } from "~/lib/utils";
import {
  SET_CHECK_COLUMN_CLASS,
  SET_NUMBER_COLUMN_CLASS,
  SET_TABLE_MAX_FONT_SCALE,
  SET_TARGET_COLUMN_CLASS,
} from "../forms/workout-exercise-set-form";
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
    set: SavedWorkoutSessionExerciseSet,
    nextSetOrder: number | null
  ) => void;
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
      className={cn("text-center text-mono-body text-primary", className)}
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
  workoutSessionExerciseSets,
  readOnly = false,
  sessionId,
}: WorkoutSessionExerciseSetsTableViewProps) {
  const { data: profile, isPending: isProfilePending } = useProfileQuery();
  const { i18n, t } = useTranslation();
  const weightLabel = unitName(
    i18n,
    weightUnitOf(profile?.measurement_system ?? "metric")
  );
  const [localSets, setLocalSets] = useState<LocalSet[]>([]);

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

  const handleSetLogged = (set: SavedWorkoutSessionExerciseSet) => {
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
      <VStack className="items-stretch gap-sm">
        <View
          accessibilityElementsHidden
          className="flex-row items-center gap-sm"
          importantForAccessibility="no-hide-descendants"
        >
          <ColumnLabel className={SET_NUMBER_COLUMN_CLASS}>#</ColumnLabel>
          <ColumnLabel className={SET_TARGET_COLUMN_CLASS}>
            {t("sets.columns.target")}
          </ColumnLabel>
          <ColumnLabel className="flex-1">{t("sets.columns.reps")}</ColumnLabel>
          <ColumnLabel className="flex-1">{weightLabel}</ColumnLabel>
          <View className={SET_CHECK_COLUMN_CLASS} />
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
                key={workoutSessionExerciseSet.id}
                locked={locked}
                onSetLogged={handleSetLogged}
                sessionId={sessionId}
                weightLabel={weightLabel}
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
                key={localSet.id}
                localSetId={localSet.id}
                locked={locked}
                onSetCreated={handleSetCreated}
                onSetLogged={handleSetLogged}
                order={localSet.order}
                sessionId={sessionId}
                weightLabel={weightLabel}
                workoutSessionExerciseSet={null}
              />
            );
          })}

        {!readOnly && (
          <Button
            contentColorClassName="text-primary"
            fill
            icon="plus"
            label={t("sets.addSet")}
            onPress={handleAddSet}
            size="sm"
            variant="ghost"
          />
        )}
      </VStack>
    )
  );
}
