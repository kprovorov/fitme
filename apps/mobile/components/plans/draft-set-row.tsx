import { MAX_WEIGHT_DECIMALS } from "@fitme/core";
import type { Translator } from "@fitme/i18n";
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
import { useI18n } from "~/lib/i18n";
import {
  isSavableTarget,
  removeDraftSet,
  SET_TARGET_BOUNDS,
  updateDraftSet,
} from "~/lib/plan-draft";
import type { DraftChange, DraftSet, DraftSetTarget } from "~/lib/plan-draft";
import { decimalsOf, formatSetWeight, planTargetValue } from "~/lib/set-inputs";

/** A target cell: the three share the width the other columns leave. */
const CELL_CLASS = "h-10 flex-1";

/** A cell's input: sized and aligned for the set table's numbers. */
const INPUT_CLASS = "min-h-10 text-center";

const TARGETS = ["reps", "weight", "rest"] as const;

/** A target as its field shows it: the weight with its own separator. */
const targetText = (
  value: number | null,
  target: DraftSetTarget,
  translator: Translator
) => {
  if (value === null) {
    return "";
  }

  return target === "weight"
    ? formatSetWeight(value, translator)
    : String(value);
};

/** One target's field: the row owns its text, this owns its press handler. */
const TargetField = ({
  accessibilityLabel,
  isValid,
  onChangeTarget,
  order,
  target,
  text,
}: {
  accessibilityLabel: string;
  isValid: boolean;
  onChangeTarget: (target: DraftSetTarget, text: string) => void;
  order: number;
  target: DraftSetTarget;
  text: string;
}) => {
  const change = useCallback(
    (typed: string) => onChangeTarget(target, typed),
    [onChangeTarget, target]
  );

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      className={INPUT_CLASS}
      containerClassName={CELL_CLASS}
      error={!isValid}
      keyboardType={target === "weight" ? "decimal-pad" : "number-pad"}
      maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      onChangeText={change}
      selectTextOnFocus
      testID={`draft-set-${target}-${order}`}
      value={text}
    />
  );
};

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
 * button that removes it.
 *
 * Each field keeps what the User typed while the draft keeps the number
 * `planTargetValue` reads from it, `null` for text that isn't one. A target
 * the write can't take — typed, or loaded that way — marks its field and
 * names the rule it broke under the row, so Save is never off with nothing
 * said.
 */
const DraftSetRow = ({
  canRemove,
  exerciseKey,
  onChange,
  order,
  set,
  workoutKey,
}: DraftSetRowProps) => {
  const { t } = useTranslation();
  const i18n = useI18n();

  // What the User typed, so a half-typed number isn't rewritten under them.
  const [typed, setTyped] = useState(() => ({
    reps: targetText(set.reps, "reps", i18n),
    rest: targetText(set.rest, "rest", i18n),
    weight: targetText(set.weight, "weight", i18n),
  }));

  const change = useCallback(
    (target: DraftSetTarget, text: string) => {
      setTyped((current) => ({ ...current, [target]: text }));
      onChange((draft) =>
        updateDraftSet(
          draft,
          workoutKey,
          exerciseKey,
          set.key,
          target,
          planTargetValue(text, SET_TARGET_BOUNDS[target])
        )
      );
    },
    [exerciseKey, onChange, set.key, workoutKey]
  );

  const remove = useCallback(
    () =>
      onChange((draft) =>
        removeDraftSet(draft, workoutKey, exerciseKey, set.key)
      ),
    [exerciseKey, onChange, set.key, workoutKey]
  );

  /** What's wrong with that target, or `null` while the write can take it. */
  const messageFor = (target: DraftSetTarget) => {
    if (isSavableTarget(target, set[target])) {
      return null;
    }

    // Its own rule first: a range message would name bounds `60,555` meets.
    if (target === "weight" && decimalsOf(typed.weight) > MAX_WEIGHT_DECIMALS) {
      return t("sets.form.weightDecimals", { count: MAX_WEIGHT_DECIMALS });
    }

    return t(`planEditor.workout.errors.${target}Range`, {
      max: SET_TARGET_BOUNDS[target].max,
      min: SET_TARGET_BOUNDS[target].min,
    });
  };

  const labels: Record<DraftSetTarget, string> = {
    reps: t("sets.row.repsInput", { order }),
    rest: t("sets.row.restInput", { order }),
    weight: t("sets.row.weightInput", { order }),
  };

  const messages = TARGETS.flatMap((target) => {
    const message = messageFor(target);

    return message === null ? [] : [message];
  });

  return (
    <View className="gap-1">
      <View className="gap-sm flex-row items-center">
        <View className={SET_NUMBER_COLUMN_CLASS}>
          <Text
            adjustsFontSizeToFit
            className="text-center"
            maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
            numberOfLines={1}
            variant="muted"
          >
            {`#${order}`}
          </Text>
        </View>
        {TARGETS.map((target) => (
          <TargetField
            accessibilityLabel={labels[target]}
            isValid={isSavableTarget(target, set[target])}
            key={target}
            onChangeTarget={change}
            order={order}
            target={target}
            text={typed[target]}
          />
        ))}
        {canRemove ? (
          <SetCheckCell onPress={remove}>
            <Button
              accessibilityLabel={t("planEditor.workout.removeSet", { order })}
              icon="minus.circle"
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
};

export default DraftSetRow;
