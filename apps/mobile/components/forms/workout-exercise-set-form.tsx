import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useCallback } from "react";
import {
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { Pressable, View } from "react-native";
import { z } from "zod";
import {
  formatSetWeight,
  setRepsField,
  setWeightField,
} from "~/lib/set-inputs";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { ErrorMessage } from "../ui/error-message";
import { Input } from "../ui/input";
import { Text } from "../ui/text";

interface WorkoutSessionExerciseSetFormProps {
  disabled?: boolean;
  /** Shown under the row, e.g. when saving the set failed. */
  error?: string | null;
  isDone?: boolean;
  isEditing?: boolean;
  /** The row's cells before the inputs: the set number and its target. */
  leading?: ReactNode;
  onEdit: () => void;
  onSubmit: (
    values: WorkoutSessionExerciseSetFormValues
  ) => void | Promise<void>;
  recommendedValues?: { reps: string; weight: string };
  /** The set's 1-based number, as shown on its row. */
  setIndex: number;
}

/**
 * react-hook-form reports a field as `undefined` while the form is disabled,
 * and a set row is enabled once the sets before it are logged: read that as
 * an empty field (the shown placeholder).
 */
const optionalField = <T extends z.ZodType<unknown, string>>(field: T) =>
  z
    .string()
    .optional()
    .transform((value) => value ?? "")
    .pipe(field);

const formSchema = z.object({
  reps: optionalField(setRepsField),
  weight: optionalField(setWeightField),
});

/** What the fields hold. */
type WorkoutSessionExerciseSetFormInput = z.input<typeof formSchema>;
/** The parsed set: `null` for an empty field (the placeholder's value). */
export type WorkoutSessionExerciseSetFormValues = z.output<typeof formSchema>;

/**
 * The table's numbers stop growing past this text scale, so the five columns
 * still fit a phone's width at the largest accessibility sizes.
 */
export const SET_TABLE_MAX_FONT_SCALE = 1.4;

/**
 * A REPS or KG cell: an input to log, or the logged value in the same box.
 * Each takes half the width the other columns leave.
 */
const CELL_CLASS = "h-10 flex-1";

/** A cell's input: Input's field, sized and set for numbers. */
const INPUT_CLASS = "min-h-10 px-1 text-center text-mono-body";

/** Width of a set table's `#` column: the set number, or a logged set's check. */
export const SET_NUMBER_COLUMN_CLASS = "w-7";

/** Width of a set table's target column, `12×45kg` at body size. */
export const SET_TARGET_COLUMN_CLASS = "w-20";

/**
 * Width of the check column, a small circle Button's diameter; the table's
 * header lines up with it.
 */
export const SET_CHECK_COLUMN_CLASS =
  "w-(--size-button-circle-sm) items-center";

/**
 * How far the check column's tap area reaches past a small circle Button
 * (28 pt), so the target is at least 44 pt.
 */
const CHECK_HIT_SLOP = 10;

/**
 * The check column's button with a 44 pt tap target around the small circle:
 * an invisible Pressable behind it takes the taps that miss the circle. It's
 * the button's sibling, not its parent, so a tap on the circle fires once.
 * VoiceOver skips it and reads the button.
 */
function SetCheckCell({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: () => void;
}) {
  return (
    <View className={SET_CHECK_COLUMN_CLASS}>
      <Pressable
        accessible={false}
        className="absolute inset-0"
        hitSlop={CHECK_HIT_SLOP}
        onPress={onPress}
      />
      {children}
    </View>
  );
}

/**
 * A logged value, shown dimmed in place of its input until the set is
 * edited: a ghost Input's box, with no stroke.
 */
function LoggedValue({ value }: { value?: string }) {
  return (
    <View
      className={cn(
        CELL_CLASS,
        "items-center justify-center rounded-lg border border-continuous border-transparent opacity-50"
      )}
    >
      <Text
        className="text-foreground text-mono-body"
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * A set row: `leading` cells, then REPS, KG and the check column, with any
 * error under the row. A set to log shows inputs with the recommended values
 * as placeholders and a lime check; a logged set shows its values dimmed with
 * no stroke and only a pencil that opens it for editing. A set waiting on an
 * earlier one shows its inputs as dimmed ghost Inputs and nothing in the
 * check column.
 */
export default function WorkoutSessionExerciseSetForm({
  onSubmit,
  onEdit,
  leading,
  recommendedValues,
  disabled,
  error,
  isDone,
  isEditing,
  setIndex,
}: WorkoutSessionExerciseSetFormProps) {
  const form = useForm<
    WorkoutSessionExerciseSetFormInput,
    unknown,
    WorkoutSessionExerciseSetFormValues
  >({
    defaultValues: {
      reps: "",
      weight: "",
    },
    disabled,
    resolver: zodResolver(formSchema),
  });

  const { disabled: isFormDisabled } = form.formState;
  const showsLoggedValues = isDone && !isEditing;

  // The fields then show what is sent, so what was stored: `05` as `5`,
  // `1.50` as `1,5`.
  const submit = form.handleSubmit((values) => {
    if (values.weight !== null) {
      form.setValue("weight", formatSetWeight(values.weight));
    }
    if (values.reps !== null) {
      form.setValue("reps", values.reps.toString());
    }
    return onSubmit(values);
  });

  // Opening a logged set clears the fields, so they show its current values
  // as placeholders rather than what was typed when it was last saved (the
  // set may have changed since, e.g. by Arnold).
  const startEditing = useCallback(() => {
    form.reset({ reps: "", weight: "" });
    onEdit();
  }, [form, onEdit]);

  const renderWeightField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error: fieldError },
    }: {
      field: ControllerRenderProps<
        WorkoutSessionExerciseSetFormInput,
        "weight"
      >;
      fieldState: ControllerFieldState;
    }) => (
      <Input
        accessibilityLabel={`Set ${setIndex} weight`}
        className={INPUT_CLASS}
        containerClassName={CELL_CLASS}
        editable={!isFormDisabled}
        error={!!fieldError}
        keyboardType="decimal-pad"
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={recommendedValues?.weight}
        selectTextOnFocus
        testID={`set-weight-input-${setIndex}`}
        value={value}
        variant={isFormDisabled ? "ghost" : "default"}
      />
    ),
    [isFormDisabled, recommendedValues?.weight, setIndex]
  );

  const renderRepsField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error: fieldError },
    }: {
      field: ControllerRenderProps<WorkoutSessionExerciseSetFormInput, "reps">;
      fieldState: ControllerFieldState;
    }) => (
      <Input
        accessibilityLabel={`Set ${setIndex} reps`}
        autoCapitalize="none"
        className={INPUT_CLASS}
        containerClassName={CELL_CLASS}
        editable={!isFormDisabled}
        error={!!fieldError}
        keyboardType="number-pad"
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={recommendedValues?.reps}
        selectTextOnFocus
        testID={`set-reps-input-${setIndex}`}
        value={value}
        variant={isFormDisabled ? "ghost" : "default"}
      />
    ),
    [isFormDisabled, recommendedValues?.reps, setIndex]
  );

  const { errors } = form.formState;

  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-sm">
        {leading}
        {showsLoggedValues ? (
          <LoggedValue value={recommendedValues?.reps} />
        ) : (
          <Controller
            control={form.control}
            name="reps"
            render={renderRepsField}
          />
        )}
        {showsLoggedValues ? (
          <LoggedValue value={recommendedValues?.weight} />
        ) : (
          <Controller
            control={form.control}
            name="weight"
            render={renderWeightField}
          />
        )}

        {showsLoggedValues ? (
          <SetCheckCell onPress={startEditing}>
            <Button
              accessibilityHint="Opens the set for editing"
              accessibilityLabel={`Edit set ${setIndex}`}
              contentColorClassName="text-muted-foreground"
              icon="pencil"
              onPress={startEditing}
              shape="circle"
              size="sm"
              testID={`edit-set-button-${setIndex}`}
              variant="ghost"
            />
          </SetCheckCell>
        ) : disabled ? (
          <View className={SET_CHECK_COLUMN_CLASS} />
        ) : (
          <SetCheckCell onPress={submit}>
            <Button
              accessibilityLabel={`Log set ${setIndex}`}
              icon="checkmark"
              onPress={submit}
              shape="circle"
              size="sm"
              testID={`log-set-button-${setIndex}`}
            />
          </SetCheckCell>
        )}
      </View>
      {errors.weight ? (
        <ErrorMessage>{errors.weight.message}</ErrorMessage>
      ) : null}
      {errors.reps ? <ErrorMessage>{errors.reps.message}</ErrorMessage> : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </View>
  );
}
