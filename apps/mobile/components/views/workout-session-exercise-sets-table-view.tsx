import { unitName } from "@fitme/i18n";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import {
  addSet,
  dropReadAddedSets,
  markAddedSetSaved,
} from "~/hooks/added-sets";
import type { SavedWorkoutSessionExerciseSet } from "~/hooks/queries/workout-session-exercise-sets";
import type {
  WorkoutSession,
  WorkoutSessionSet,
} from "~/hooks/queries/workout-sessions";
import { isUnlogged, nextUnloggedSet, useShownSets } from "~/hooks/shown-sets";
import { cn } from "~/lib/utils";

import {
  SET_CHECK_COLUMN_CLASS,
  SET_TABLE_MAX_FONT_SCALE,
} from "../forms/workout-exercise-set-form";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import WorkoutSessionExerciseSetRowView from "./workout-session-exercise-set-row-view";

interface WorkoutSessionExerciseSetsTableViewProps {
  exerciseId: string;
  /**
   * A set was logged for the first time; `hasNextSet` is whether one is still
   * to log (an added one included).
   */
  onSetLogged?: (
    set: SavedWorkoutSessionExerciseSet,
    hasNextSet: boolean
  ) => void;
  readOnly?: boolean;
  sessionId: string;
  /** The unit its Workout Session's weights are in. */
  weightUnit: WorkoutSession["weight_unit"];
  workoutSessionExerciseSets: WorkoutSessionSet[];
}

const ColumnLabel = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <Text
    adjustsFontSizeToFit
    className={cn("text-center", className)}
    maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
    numberOfLines={1}
  >
    {children}
  </Text>
);

const WorkoutSessionExerciseSetsTableView = ({
  exerciseId,
  onSetLogged,
  workoutSessionExerciseSets,
  readOnly = false,
  sessionId,
  weightUnit,
}: WorkoutSessionExerciseSetsTableViewProps) => {
  const { i18n, t } = useTranslation();
  const weightLabel = unitName(i18n, weightUnit);
  // Added sets live outside this table, so the session screen and the
  // Workout Session Exercise screen show the same ones until they're logged.
  const rows = useShownSets(exerciseId, workoutSessionExerciseSets, readOnly);
  const lastSet = rows.findLast(({ set }) => set)?.set;

  // An added set starts from the Exercise's last one, as the Plan editor's
  // Add Set does: what was logged, or its targets while it isn't.
  const addedSetValues = lastSet
    ? {
        reps: lastSet.reps_completed ?? lastSet.reps_recommended ?? 0,
        weight: lastSet.weight_completed ?? lastSet.weight_recommended ?? 0,
      }
    : undefined;

  const handleAddSet = () => {
    // After the highest `order`, as the API places it once it's logged.
    addSet(exerciseId, Math.max(0, ...rows.map(({ order }) => order)) + 1);
  };

  // Its place is the read's from here on, and so is its removal.
  useEffect(() => {
    dropReadAddedSets(
      exerciseId,
      new Set(workoutSessionExerciseSets.map(({ id }) => id))
    );
  }, [exerciseId, workoutSessionExerciseSets]);

  return (
    <View className="gap-sm flex flex-col items-stretch justify-center">
      <View
        accessibilityElementsHidden
        className="gap-xs flex-row items-center"
        importantForAccessibility="no-hide-descendants"
      >
        <ColumnLabel className="w-7">#</ColumnLabel>
        <ColumnLabel className="w-20">{t("sets.columns.target")}</ColumnLabel>
        <ColumnLabel className="flex-1">{t("sets.columns.reps")}</ColumnLabel>
        <ColumnLabel className="flex-2">{weightLabel}</ColumnLabel>
        <View className={SET_CHECK_COLUMN_CLASS} />
      </View>

      {rows.map(({ id, number, set }, index) => {
        const locked = rows.slice(0, index).some(isUnlogged);

        return (
          <WorkoutSessionExerciseSetRowView
            exerciseId={exerciseId}
            initialValues={set ? undefined : addedSetValues}
            key={id}
            locked={locked}
            number={number}
            onSetCreated={(created) =>
              markAddedSetSaved(exerciseId, id, created)
            }
            onSetLogged={(logged) =>
              onSetLogged?.(logged, !!nextUnloggedSet(rows, id))
            }
            sessionId={sessionId}
            weightLabel={weightLabel}
            workoutSessionExerciseSet={set}
          />
        );
      })}

      {!readOnly && (
        <Button
          fill
          icon="plus"
          label={t("sets.addSet")}
          onPress={handleAddSet}
          size="sm"
          variant="ghost"
        />
      )}
    </View>
  );
};

export default WorkoutSessionExerciseSetsTableView;
