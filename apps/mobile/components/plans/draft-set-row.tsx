import {
  MAX_REPS,
  MAX_REST_SECONDS,
  MAX_WEIGHT,
  MAX_WEIGHT_DECIMALS,
} from "@fitme/core";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
  SET_CHECK_COLUMN_CLASS,
  SET_NUMBER_COLUMN_CLASS,
  SET_TABLE_MAX_FONT_SCALE,
  SetCheckCell,
} from "~/components/forms/workout-exercise-set-form";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import {
  type DraftChange,
  type DraftSet,
  type DraftSetTarget,
  removeDraftSet,
  updateDraftSet,
} from "~/lib/plan-draft";
import { formatSetWeight, planTargetValue } from "~/lib/set-inputs";
import { cn } from "~/lib/utils";

/** A target cell: the three share the width the other columns leave. */
const CELL_CLASS = "h-10 flex-1";
/** A cell's input: the set table's number styling. */
const INPUT_CLASS = "min-h-10 px-1 text-center text-mono-body";

/** The write's bounds for each target, which `planTargetValue` holds it to. */
const BOUNDS = {
  reps: { max: MAX_REPS, min: 1 },
  rest: { max: MAX_REST_SECONDS, min: 0 },
  weight: { decimals: MAX_WEIGHT_DECIMALS, max: MAX_WEIGHT, min: 0 },
} as const;

/** A target as its field shows it: the weight with its own separator. */
const targetText = (value: number | null, target: DraftSetTarget) => {
  if (value === null) {
    return "";
  }
  return target === "weight" ? formatSetWeight(value) : String(value);
};

interface DraftSetFieldProps {
  accessibilityLabel: string;
  onChangeValue: (value: number | null) => void;
  target: DraftSetTarget;
  testID: string;
  value: number | null;
}

/**
 * One target of a set: what the User typed stays as typed, and the draft
 * keeps the number it reads, `null` for anything the write can't take, which
 * marks the field and disables Save.
 */
function DraftSetField({
  accessibilityLabel,
  onChangeValue,
  target,
  testID,
  value,
}: DraftSetFieldProps) {
  const [text, setText] = useState(() => targetText(value, target));
  const change = useCallback(
    (typed: string) => {
      setText(typed);
      onChangeValue(planTargetValue(typed, BOUNDS[target]));
    },
    [onChangeValue, target]
  );

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      className={INPUT_CLASS}
      containerClassName={CELL_CLASS}
      error={value === null}
      keyboardType={target === "weight" ? "decimal-pad" : "number-pad"}
      maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      onChangeText={change}
      selectTextOnFocus
      testID={testID}
      value={text}
    />
  );
}

interface DraftSetRowProps {
  /** Whether the row can be removed: an Exercise keeps at least one set. */
  canRemove: boolean;
  exerciseKey: string;
  onChange: DraftChange;
  /** Its 1-based number, as the row shows it. */
  order: number;
  set: DraftSet;
  workoutKey: string;
}

/**
 * A planned set as the Workout editor edits it: its number, then reps,
 * weight (in the Plan's unit, 0 for bodyweight) and rest in seconds, and the
 * button that removes it. Every keystroke goes into the draft, and a target
 * the write can't take is marked with the bound it broke under the row.
 */
export default function DraftSetRow({
  canRemove,
  exerciseKey,
  onChange,
  order,
  set,
  workoutKey,
}: DraftSetRowProps) {
  const { t } = useTranslation();

  const changeTarget = useCallback(
    (target: DraftSetTarget, value: number | null) =>
      onChange((draft) =>
        updateDraftSet(draft, workoutKey, exerciseKey, set.key, target, value)
      ),
    [exerciseKey, onChange, set.key, workoutKey]
  );
  const changeReps = useCallback(
    (value: number | null) => changeTarget("reps", value),
    [changeTarget]
  );
  const changeWeight = useCallback(
    (value: number | null) => changeTarget("weight", value),
    [changeTarget]
  );
  const changeRest = useCallback(
    (value: number | null) => changeTarget("rest", value),
    [changeTarget]
  );
  const remove = useCallback(
    () =>
      onChange((draft) =>
        removeDraftSet(draft, workoutKey, exerciseKey, set.key)
      ),
    [exerciseKey, onChange, set.key, workoutKey]
  );

  const messages = [
    set.reps === null
      ? t("planEditor.workout.errors.repsRange", BOUNDS.reps)
      : null,
    set.weight === null
      ? t("planEditor.workout.errors.weightRange", BOUNDS.weight)
      : null,
    set.rest === null
      ? t("planEditor.workout.errors.restRange", BOUNDS.rest)
      : null,
  ].filter((message): message is string => message !== null);

  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-sm">
        <Text
          adjustsFontSizeToFit
          className={cn(
            SET_NUMBER_COLUMN_CLASS,
            "text-center text-mono-body text-muted-foreground"
          )}
          maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
          numberOfLines={1}
        >
          {`#${order}`}
        </Text>
        <DraftSetField
          accessibilityLabel={t("sets.row.repsInput", { order })}
          onChangeValue={changeReps}
          target="reps"
          testID={`draft-set-reps-${order}`}
          value={set.reps}
        />
        <DraftSetField
          accessibilityLabel={t("sets.row.weightInput", { order })}
          onChangeValue={changeWeight}
          target="weight"
          testID={`draft-set-weight-${order}`}
          value={set.weight}
        />
        <DraftSetField
          accessibilityLabel={t("sets.row.restInput", { order })}
          onChangeValue={changeRest}
          target="rest"
          testID={`draft-set-rest-${order}`}
          value={set.rest}
        />
        {canRemove ? (
          <SetCheckCell onPress={remove}>
            <Button
              accessibilityLabel={t("planEditor.workout.removeSet", { order })}
              contentColorClassName="text-muted-foreground"
              icon="minus"
              onPress={remove}
              shape="circle"
              size="sm"
              testID={`remove-draft-set-${order}`}
              variant="ghost"
            />
          </SetCheckCell>
        ) : (
          <View className={SET_CHECK_COLUMN_CLASS} />
        )}
      </View>
      {messages.map((message) => (
        <ErrorMessage key={message}>{message}</ErrorMessage>
      ))}
    </View>
  );
}
