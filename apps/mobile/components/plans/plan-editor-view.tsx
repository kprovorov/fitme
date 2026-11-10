import {
  experienceLevels,
  goals,
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_WORKOUT_DURATION_MINUTES,
  MIN_FREQUENCY,
  places,
} from "@fitme/core";
import type { ExperienceLevel, Goal, Place } from "@fitme/core";
import { formatCount } from "@fitme/i18n";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { DropdownMenu } from "~/components/ui/dropdown-menu";
import { ErrorMessage } from "~/components/ui/error-message";
import { HStack } from "~/components/ui/hstack";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { MenuList } from "~/components/ui/menu-list";
import { Select } from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import { H4 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useChoiceLabels } from "~/lib/choices";
import { useI18n } from "~/lib/i18n";
import {
  canAddDraftWorkout,
  isSavableWorkout,
  moveDraftWorkout,
  isPlanNumberIn,
  removeDraftWorkout,
  wholePlanNumber,
} from "~/lib/plan-draft";
import type { DraftChange, DraftWorkout, PlanDraft } from "~/lib/plan-draft";

interface PlanEditorViewProps {
  draft: PlanDraft;
  /** Adds a Workout at the end of the rotation and opens its editor. */
  onAddWorkout: () => void;
  onChange: DraftChange;
  /** Opens that Workout's editor, pushed over this Screen. */
  onOpenWorkout: (workoutKey: string) => void;
  /** What a failed save said, shown above the form until the next try. */
  saveError?: string | null;
}

const isOutside = (value: number | null, min: number, max: number) =>
  !isPlanNumberIn(value, min, max);

/**
 * What a cleared choice is while the `Picker` holds it: it has no value for
 * "nothing", so the Unset option carries the empty string and the draft gets
 * `null` back (ADR 0017).
 */
const UNSET = "";

/** One of the four optional details, as its `Picker` holds it. */
type Choice<TValue extends string> = TValue | typeof UNSET;

/** One option of such a detail's `Picker`, the Unset one included. */
interface ChoiceOption<TValue extends string> {
  label: string;
  value: Choice<TValue>;
}

/** A field with its label above it, as every field of the editor has. */
const Field = ({ children, label }: { children: ReactNode; label: string }) => (
  <View className="flex flex-col items-stretch justify-center gap-2">
    <Label>{label}</Label>
    {children}
  </View>
);

/** A number the User types, kept as typed while the draft holds its value. */
const NumberField = ({
  error,
  label,
  onChangeNumber,
  testID,
  unit,
  value,
}: {
  error?: string;
  label: string;
  onChangeNumber: (value: number | null) => void;
  testID: string;
  /** Shown after the field (minutes), for a number that has one. */
  unit?: string;
  value: number | null;
}) => {
  // What the User typed, so a half-typed number isn't rewritten under them;
  // the draft keeps the value it parses to (`null` for none).
  const [text, setText] = useState(value === null ? "" : String(value));

  const change = useCallback(
    (typed: string) => {
      setText(typed);
      onChangeNumber(wholePlanNumber(typed));
    },
    [onChangeNumber]
  );

  const field = (
    <Input
      containerClassName={unit ? "flex-1" : undefined}
      error={error}
      keyboardType="number-pad"
      onChangeText={change}
      testID={testID}
      value={text}
    />
  );

  return (
    <Field label={label}>
      {unit ? (
        <HStack className="items-start">
          {field}
          <View className="pt-3">
            <Text variant="muted">{unit}</Text>
          </View>
        </HStack>
      ) : (
        field
      )}
    </Field>
  );
};

const WorkoutRow = ({
  index,
  onChange,
  onOpen,
  total,
  workout,
}: {
  index: number;
  onChange: DraftChange;
  onOpen: (workoutKey: string) => void;
  total: number;
  workout: DraftWorkout;
}) => {
  const { t } = useTranslation();
  const i18n = useI18n();

  const items = useMemo(() => {
    const actions: {
      destructive?: boolean;
      label: string;
      onPress: () => void;
      systemImage: "arrow.up" | "arrow.down" | "trash";
    }[] = [];

    if (index > 0) {
      actions.push({
        label: t("planEditor.moveUp", { name: workout.name }),
        onPress: () => onChange((draft) => moveDraftWorkout(draft, index, -1)),
        systemImage: "arrow.up",
      });
    }

    if (index < total - 1) {
      actions.push({
        label: t("planEditor.moveDown", { name: workout.name }),
        onPress: () => onChange((draft) => moveDraftWorkout(draft, index, 1)),
        systemImage: "arrow.down",
      });
    }

    actions.push({
      destructive: true,
      label: t("planEditor.remove", { name: workout.name }),
      onPress: () => onChange((draft) => removeDraftWorkout(draft, index)),
      systemImage: "trash",
    });

    return actions;
  }, [index, onChange, t, total, workout.name]);

  const open = useCallback(() => onOpen(workout.key), [onOpen, workout.key]);

  // Why Save is off, for a Workout whose own editor would have to show it:
  // no Exercise, or a name or a set target the whole-Plan save can't take.
  let problem: string | undefined;

  if (workout.exercises.length === 0) {
    problem = t("planEditor.workoutNeedsExercise");
  } else if (!isSavableWorkout(workout)) {
    problem = t("planEditor.workoutNeedsFixing");
  }

  // The menu is the row's sibling, not inside its Pressable, so a tap on it
  // opens the menu instead of the Workout.
  return (
    <View className="flex flex-row items-center justify-between gap-2 pr-4">
      <Pressable
        accessibilityLabel={t("planEditor.openWorkout", {
          name: workout.name,
        })}
        accessibilityRole="button"
        className="flex-1 flex-row items-center gap-2 py-4 pl-4 active:opacity-80"
        onPress={open}
      >
        <View className="flex flex-1 flex-col items-start justify-center gap-0">
          <Text variant="large">{workout.name}</Text>
          <Text variant="muted">
            {formatCount(i18n, "exercises", workout.exercises.length)}
          </Text>
          {problem ? <ErrorMessage>{problem}</ErrorMessage> : null}
        </View>
        <SymbolImage
          className="text-body text-muted-foreground shrink-0"
          name="chevron.right"
        />
      </Pressable>
      <DropdownMenu
        accessibilityLabel={t("planEditor.workoutActions", {
          name: workout.name,
        })}
        items={items}
        systemImage="ellipsis"
      />
    </View>
  );
};

/**
 * The Plan editor's form: the Plan's details, then its Workouts as rows in
 * rotation order, each with the menu that moves or removes it. Every change
 * goes straight into the draft (`onChange`), which is what Save sends; the
 * errors it shows are the bounds `isSavablePlanDraft` holds Save to.
 */
const PlanEditorView = ({
  draft,
  onAddWorkout,
  onChange,
  onOpenWorkout,
  saveError,
}: PlanEditorViewProps) => {
  const { t } = useTranslation();
  const labels = useChoiceLabels();

  const setName = useCallback(
    (name: string) => onChange((drafted) => ({ ...drafted, name })),
    [onChange]
  );

  const setDescription = useCallback(
    (description: string) =>
      onChange((drafted) => ({ ...drafted, description })),
    [onChange]
  );

  const setFrequency = useCallback(
    (frequency: number | null) =>
      onChange((drafted) => ({ ...drafted, frequency })),
    [onChange]
  );

  const setWorkoutDuration = useCallback(
    (workoutDuration: number | null) =>
      onChange((drafted) => ({ ...drafted, workoutDuration })),
    [onChange]
  );

  const setGoal = useCallback(
    (goal: Choice<Goal>) =>
      onChange((drafted) => ({
        ...drafted,
        goal: goal === UNSET ? null : goal,
      })),
    [onChange]
  );

  const setExperienceLevel = useCallback(
    (experienceLevel: Choice<ExperienceLevel>) =>
      onChange((drafted) => ({
        ...drafted,
        experienceLevel: experienceLevel === UNSET ? null : experienceLevel,
      })),
    [onChange]
  );

  const setPlace = useCallback(
    (place: Choice<Place>) =>
      onChange((drafted) => ({
        ...drafted,
        place: place === UNSET ? null : place,
      })),
    [onChange]
  );

  // Each choice can be cleared back to unset, so every list starts with the
  // Unset option (ADR 0017).
  const unset = t("planEditor.unset");

  const goalOptions = useMemo<ChoiceOption<Goal>[]>(
    () => [
      { label: unset, value: UNSET },
      ...goals.map((goal) => ({ label: labels.goal(goal), value: goal })),
    ],
    [labels, unset]
  );

  const levelOptions = useMemo<ChoiceOption<ExperienceLevel>[]>(
    () => [
      { label: unset, value: UNSET },
      ...experienceLevels.map((level) => ({
        label: labels.experienceLevel(level),
        value: level,
      })),
    ],
    [labels, unset]
  );

  const placeOptions = useMemo<ChoiceOption<Place>[]>(
    () => [
      { label: unset, value: UNSET },
      ...places.map((place) => ({
        label: labels.place(place),
        value: place,
      })),
    ],
    [labels, unset]
  );

  const descriptionError =
    draft.description.trim().length > MAX_PLAN_TEXT_LENGTH
      ? t("planEditor.errors.descriptionTooLong", { max: MAX_PLAN_TEXT_LENGTH })
      : undefined;

  const trimmedName = draft.name.trim();
  let nameError: string | undefined;

  if (trimmedName === "") {
    nameError = t("planEditor.errors.nameRequired");
  } else if (trimmedName.length > MAX_PLAN_NAME_LENGTH) {
    nameError = t("planEditor.errors.nameTooLong", {
      max: MAX_PLAN_NAME_LENGTH,
    });
  }

  return (
    <View className="gap-lg flex flex-col items-stretch justify-center">
      {saveError ? <ErrorMessage>{saveError}</ErrorMessage> : null}

      <View className="gap-md flex flex-col items-stretch justify-center">
        <H4>{t("planEditor.details")}</H4>
        <Field label={t("planEditor.name")}>
          <Input
            error={nameError}
            onChangeText={setName}
            placeholder={t("planEditor.namePlaceholder")}
            testID="plan-name"
            value={draft.name}
          />
        </Field>
        <Field label={t("planEditor.description")}>
          <Textarea
            error={descriptionError}
            onChangeText={setDescription}
            placeholder={t("planEditor.descriptionPlaceholder")}
            testID="plan-description"
            value={draft.description}
          />
        </Field>
        <NumberField
          error={
            isOutside(draft.frequency, MIN_FREQUENCY, MAX_FREQUENCY)
              ? t("planEditor.errors.frequencyRange", {
                  max: MAX_FREQUENCY,
                  min: MIN_FREQUENCY,
                })
              : undefined
          }
          label={t("planEditor.frequency")}
          onChangeNumber={setFrequency}
          testID="plan-frequency"
          value={draft.frequency}
        />
        <NumberField
          error={
            // Optional (ADR 0017): an empty field is unset, not an error.
            // Text that isn't a whole number is `NaN`, never `null`, so it
            // is an error rather than a Plan whose duration was cleared.
            draft.workoutDuration !== null &&
            isOutside(draft.workoutDuration, 1, MAX_WORKOUT_DURATION_MINUTES)
              ? t("planEditor.errors.durationRange", {
                  max: MAX_WORKOUT_DURATION_MINUTES,
                })
              : undefined
          }
          label={t("planEditor.duration")}
          onChangeNumber={setWorkoutDuration}
          testID="plan-duration"
          unit={t("planEditor.durationUnit")}
          value={draft.workoutDuration}
        />
        {/* A menu `Picker` only draws its own label inside a Form, so each
            one gets the same label above it as the fields have. */}
        <Field label={t("planEditor.goal")}>
          <Select
            onValueChange={setGoal}
            options={goalOptions}
            testID="plan-goal"
            value={draft.goal ?? UNSET}
          />
        </Field>
        <Field label={t("planEditor.experience")}>
          <Select
            onValueChange={setExperienceLevel}
            options={levelOptions}
            testID="plan-experience"
            value={draft.experienceLevel ?? UNSET}
          />
        </Field>
        <Field label={t("planEditor.place")}>
          <Select
            onValueChange={setPlace}
            options={placeOptions}
            testID="plan-place"
            value={draft.place ?? UNSET}
          />
        </Field>
      </View>

      <VStack className="items-stretch">
        <H4>{t("planEditor.workouts")}</H4>
        <Text variant="muted">{t("planEditor.workoutsHint")}</Text>
        {draft.workouts.length > 0 ? (
          <MenuList>
            {draft.workouts.map((workout, index) => (
              <View key={workout.key}>
                {index > 0 ? <Separator /> : null}
                <WorkoutRow
                  index={index}
                  onChange={onChange}
                  onOpen={onOpenWorkout}
                  total={draft.workouts.length}
                  workout={workout}
                />
              </View>
            ))}
          </MenuList>
        ) : (
          <Text variant="muted">{t("planEditor.noWorkouts")}</Text>
        )}
        <Button
          className="self-start"
          disabled={!canAddDraftWorkout(draft)}
          fill={false}
          icon="plus"
          label={t("planEditor.addWorkout")}
          onPress={onAddWorkout}
          size="lg"
          testID="add-draft-workout"
          variant="secondary"
        />
      </VStack>
    </View>
  );
};

export default PlanEditorView;
