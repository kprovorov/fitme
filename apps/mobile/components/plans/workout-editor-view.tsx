import { MAX_PLAN_NAME_LENGTH } from "@fitme/core";
import { unitName } from "@fitme/i18n";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import DraftSetRow from "~/components/plans/draft-set-row";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import ExerciseCardHeader from "~/components/views/exercise-card-header";
import { shownExercise, useExercises } from "~/hooks/queries/library";
import type { ShownExercise } from "~/hooks/queries/library";
import type { FullPlan } from "~/hooks/queries/plans";
import { useI18n } from "~/lib/i18n";
import {
  addDraftSet,
  canAddDraftExercise,
  canAddDraftSet,
  moveDraftExercise,
  removeDraftExercise,
  renameDraftWorkout,
} from "~/lib/plan-draft";
import type {
  DraftChange,
  DraftExercise,
  DraftWorkout,
} from "~/lib/plan-draft";

import {
  SET_CHECK_COLUMN_CLASS,
  SET_NUMBER_COLUMN_CLASS,
  SET_TABLE_MAX_FONT_SCALE,
} from "../forms/workout-exercise-set-form";

/** The set table's column headings, lined up with `DraftSetRow`'s cells. */
function SetColumns({ weightLabel }: { weightLabel: string }) {
  const { t } = useTranslation();
  const heading = "flex-1 text-center text-mono-footnote text-primary";

  return (
    <View
      accessibilityElementsHidden
      className="gap-sm flex-row items-center"
      importantForAccessibility="no-hide-descendants"
    >
      <Text className={SET_NUMBER_COLUMN_CLASS} />
      <Text
        className={heading}
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      >
        {t("sets.columns.reps")}
      </Text>
      <Text
        className={heading}
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      >
        {weightLabel}
      </Text>
      <Text
        className={heading}
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      >
        {t("sets.columns.rest")}
      </Text>
      <Text className={SET_CHECK_COLUMN_CLASS} />
    </View>
  );
}

interface DraftExerciseCardProps {
  exercise: DraftExercise;
  index: number;
  onChange: DraftChange;
  onReplace: (exerciseKey: string) => void;
  shown: ShownExercise;
  total: number;
  weightLabel: string;
  workoutKey: string;
}

/**
 * One Exercise of the Workout: its Library name and thumbnail (its slug's
 * name while the Library hasn't resolved it), the menu that moves, replaces
 * or removes it, and its sets as rows with Add Set under them.
 */
function DraftExerciseCard({
  exercise,
  index,
  onChange,
  onReplace,
  shown,
  total,
  weightLabel,
  workoutKey,
}: DraftExerciseCardProps) {
  const { t } = useTranslation();
  const { name } = shown;

  const items = useMemo(() => {
    const actions: {
      destructive?: boolean;
      label: string;
      onPress: () => void;
      systemImage:
        | "arrow.up"
        | "arrow.down"
        | "arrow.left.arrow.right"
        | "trash";
    }[] = [];

    if (index > 0) {
      actions.push({
        label: t("planEditor.workout.moveUp", { name }),
        onPress: () =>
          onChange((draft) =>
            moveDraftExercise(draft, workoutKey, exercise.key, -1)
          ),
        systemImage: "arrow.up",
      });
    }

    if (index < total - 1) {
      actions.push({
        label: t("planEditor.workout.moveDown", { name }),
        onPress: () =>
          onChange((draft) =>
            moveDraftExercise(draft, workoutKey, exercise.key, 1)
          ),
        systemImage: "arrow.down",
      });
    }

    actions.push(
      {
        label: t("planEditor.workout.replace", { name }),
        onPress: () => onReplace(exercise.key),
        systemImage: "arrow.left.arrow.right",
      },
      {
        destructive: true,
        label: t("planEditor.workout.remove", { name }),
        onPress: () =>
          onChange((draft) =>
            removeDraftExercise(draft, workoutKey, exercise.key)
          ),
        systemImage: "trash",
      }
    );

    return actions;
  }, [exercise.key, index, name, onChange, onReplace, t, total, workoutKey]);

  const addSet = useCallback(
    () => onChange((draft) => addDraftSet(draft, workoutKey, exercise.key)),
    [exercise.key, onChange, workoutKey]
  );

  return (
    <Card className="gap-sm" testID={`draft-exercise-${index + 1}`}>
      <ExerciseCardHeader
        exercise={shown}
        trailing={
          <DropdownMenu
            accessibilityLabel={t("planEditor.workout.exerciseActions", {
              name,
            })}
            items={items}
            systemImage="ellipsis"
          />
        }
      />
      <SetColumns weightLabel={weightLabel} />
      {exercise.sets.map((set, at) => (
        <DraftSetRow
          canRemove={exercise.sets.length > 1}
          exerciseKey={exercise.key}
          key={set.key}
          onChange={onChange}
          order={at + 1}
          set={set}
          workoutKey={workoutKey}
        />
      ))}
      <Separator />
      {/* The Workout Session's Add Set, so the same control reads the same
          one Screen away. */}
      <Button
        contentColorClassName="text-primary"
        disabled={!canAddDraftSet(exercise)}
        fill
        icon="plus"
        label={t("sets.addSet")}
        onPress={addSet}
        size="sm"
        testID={`add-draft-set-${index + 1}`}
        variant="ghost"
      />
    </Card>
  );
}

interface WorkoutEditorViewProps {
  onAddExercise: () => void;
  onChange: DraftChange;
  onReplaceExercise: (exerciseKey: string) => void;
  /** The unit its sets' weights are in, from the Plan's own read. */
  weightUnit: FullPlan["weight_unit"];
  workout: DraftWorkout;
}

/**
 * The Workout editor's form: the Workout's name, then its Exercises in the
 * order they're performed, each with its sets. Every change goes straight
 * into the draft (`onChange`), which the Plan editor's one Save sends; this
 * Screen has no Save of its own.
 */
export default function WorkoutEditorView({
  onAddExercise,
  onChange,
  onReplaceExercise,
  weightUnit,
  workout,
}: WorkoutEditorViewProps) {
  const { t } = useTranslation();
  const i18n = useI18n();
  const weightLabel = unitName(i18n, weightUnit);

  const shownBySlug = useExercises(
    workout.exercises.map((exercise) => exercise.exerciseSlug)
  );

  const setName = useCallback(
    (name: string) =>
      onChange((draft) => renameDraftWorkout(draft, workout.key, name)),
    [onChange, workout.key]
  );

  const trimmedName = workout.name.trim();
  let nameError: string | undefined;

  if (trimmedName === "") {
    nameError = t("planEditor.workout.errors.nameRequired");
  } else if (trimmedName.length > MAX_PLAN_NAME_LENGTH) {
    nameError = t("planEditor.errors.nameTooLong", {
      max: MAX_PLAN_NAME_LENGTH,
    });
  }

  return (
    <VStack className="gap-lg items-stretch">
      <VStack className="items-stretch gap-2">
        <Label>{t("planEditor.workout.name")}</Label>
        <Input
          error={nameError}
          onChangeText={setName}
          placeholder={t("planEditor.workout.namePlaceholder")}
          testID="workout-name"
          value={workout.name}
        />
      </VStack>

      <VStack className="gap-sm items-stretch">
        <H4>{t("planEditor.workout.exercises")}</H4>
        {workout.exercises.length > 0 ? (
          <Text className="text-muted-foreground text-subhead">
            {t("planEditor.workout.exercisesHint")}
          </Text>
        ) : null}
        {workout.exercises.length > 0 ? (
          workout.exercises.map((exercise, index) => (
            <DraftExerciseCard
              exercise={exercise}
              index={index}
              key={exercise.key}
              onChange={onChange}
              onReplace={onReplaceExercise}
              shown={
                shownBySlug[exercise.exerciseSlug] ??
                shownExercise(exercise.exerciseSlug, null)
              }
              total={workout.exercises.length}
              weightLabel={weightLabel}
              workoutKey={workout.key}
            />
          ))
        ) : (
          <Text className="text-muted-foreground">
            {t("planEditor.workout.noExercises")}
          </Text>
        )}
        <Button
          className="self-start"
          disabled={!canAddDraftExercise(workout)}
          fill={false}
          icon="plus"
          label={t("planEditor.workout.addExercise")}
          onPress={onAddExercise}
          testID="add-draft-exercise"
          variant="secondary"
        />
      </VStack>
    </VStack>
  );
}
