import {
  type ExperienceLevel,
  experienceLevels,
  type Goal,
  goals,
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_WORKOUT_DURATION_MINUTES,
  MIN_FREQUENCY,
  type Place,
  places,
} from "@fitme/core";
import { formatCount } from "@fitme/i18n";
import { type ReactNode, useCallback, useMemo, useState } from "react";
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
  type DraftChange,
  type DraftWorkout,
  moveDraftWorkout,
  type PlanDraft,
  removeDraftWorkout,
} from "~/lib/plan-draft";

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

const DIGITS = /^\d+$/;

/** The whole number `text` holds, or `null` when it holds none. */
const wholeNumber = (text: string): number | null => {
  const trimmed = text.trim();
  if (!DIGITS.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
};

const isOutside = (value: number | null, min: number, max: number) =>
  value === null || value < min || value > max;

/** A field with its label above it, as every field of the editor has. */
function Field({
  children,
  error,
  label,
}: {
  children: ReactNode;
  /** Shown under the field, for one that can't show its own message. */
  error?: string;
  label: string;
}) {
  return (
    <VStack className="items-stretch gap-2">
      <Label>{label}</Label>
      {children}
      {error ? (
        <Text className="text-destructive text-subhead">{error}</Text>
      ) : null}
    </VStack>
  );
}

/** A number the User types, kept as typed while the draft holds its value. */
function NumberField({
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
}) {
  // What the User typed, so a half-typed number isn't rewritten under them;
  // the draft keeps the value it parses to (`null` for none).
  const [text, setText] = useState(value === null ? "" : String(value));
  const change = useCallback(
    (typed: string) => {
      setText(typed);
      onChangeNumber(wholeNumber(typed));
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
        <HStack className="items-start gap-sm">
          {field}
          <Text className="pt-3 text-muted-foreground text-subhead">
            {unit}
          </Text>
        </HStack>
      ) : (
        field
      )}
    </Field>
  );
}

function WorkoutRow({
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
}) {
  const { t } = useTranslation();
  const i18n = useI18n();
  const items = useMemo(() => {
    const actions: Array<{
      destructive?: boolean;
      label: string;
      onPress: () => void;
      systemImage: "arrow.up" | "arrow.down" | "trash";
    }> = [];
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

  // The menu is the row's sibling, not inside its Pressable, so a tap on it
  // opens the menu instead of the Workout.
  return (
    <HStack className="items-center justify-between gap-2 pr-4">
      <Pressable
        accessibilityLabel={t("planEditor.openWorkout", {
          name: workout.name,
        })}
        accessibilityRole="button"
        className="flex-1 flex-row items-center gap-2 py-4 pl-4 active:opacity-80"
        onPress={open}
      >
        <VStack className="flex-1 items-start gap-0">
          <Text className="text-body-emphasized">{workout.name}</Text>
          <Text className="text-muted-foreground text-subhead">
            {formatCount(i18n, "exercises", workout.exercises.length)}
          </Text>
          {workout.exercises.length === 0 ? (
            <Text className="text-destructive text-subhead">
              {t("planEditor.workoutNeedsExercise")}
            </Text>
          ) : null}
        </VStack>
        <SymbolImage
          className="shrink-0 text-body text-muted-foreground"
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
    </HStack>
  );
}

/**
 * The Plan editor's form: the Plan's details, then its Workouts as rows in
 * rotation order, each with the menu that moves or removes it. Every change
 * goes straight into the draft (`onChange`), which is what Save sends; the
 * errors it shows are the bounds `isSavablePlanDraft` holds Save to.
 */
export default function PlanEditorView({
  draft,
  onAddWorkout,
  onChange,
  onOpenWorkout,
  saveError,
}: PlanEditorViewProps) {
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
    (goal: Goal) => onChange((drafted) => ({ ...drafted, goal })),
    [onChange]
  );
  const setExperienceLevel = useCallback(
    (experienceLevel: ExperienceLevel) =>
      onChange((drafted) => ({ ...drafted, experienceLevel })),
    [onChange]
  );
  const setPlace = useCallback(
    (place: Place) => onChange((drafted) => ({ ...drafted, place })),
    [onChange]
  );

  const goalOptions = useMemo(
    () => goals.map((goal) => ({ label: labels.goal(goal), value: goal })),
    [labels]
  );
  const levelOptions = useMemo(
    () =>
      experienceLevels.map((level) => ({
        label: labels.experienceLevel(level),
        value: level,
      })),
    [labels]
  );
  const placeOptions = useMemo(
    () => places.map((place) => ({ label: labels.place(place), value: place })),
    [labels]
  );

  const choiceRequired = t("planEditor.errors.choiceRequired");
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
    <VStack className="items-stretch gap-lg">
      {saveError ? <ErrorMessage>{saveError}</ErrorMessage> : null}

      <VStack className="items-stretch gap-md">
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
        <Field
          error={draft.goal === null ? choiceRequired : undefined}
          label={t("planEditor.goal")}
        >
          <Select
            onValueChange={setGoal}
            options={goalOptions}
            testID="plan-goal"
            value={draft.goal ?? undefined}
          />
        </Field>
        <Field
          error={draft.experienceLevel === null ? choiceRequired : undefined}
          label={t("planEditor.experience")}
        >
          <Select
            onValueChange={setExperienceLevel}
            options={levelOptions}
            testID="plan-experience"
            value={draft.experienceLevel ?? undefined}
          />
        </Field>
        <Field
          error={draft.place === null ? choiceRequired : undefined}
          label={t("planEditor.place")}
        >
          <Select
            onValueChange={setPlace}
            options={placeOptions}
            testID="plan-place"
            value={draft.place ?? undefined}
          />
        </Field>
      </VStack>

      <VStack className="items-stretch gap-sm">
        <H4>{t("planEditor.workouts")}</H4>
        <Text className="text-muted-foreground text-subhead">
          {t("planEditor.workoutsHint")}
        </Text>
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
          <Text className="text-muted-foreground">
            {t("planEditor.noWorkouts")}
          </Text>
        )}
        <Button
          className="self-start"
          disabled={!canAddDraftWorkout(draft)}
          fill={false}
          icon="plus"
          label={t("planEditor.addWorkout")}
          onPress={onAddWorkout}
          testID="add-draft-workout"
          variant="secondary"
        />
      </VStack>
    </VStack>
  );
}
