import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useCallback } from "react";
import {
  Controller,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { View } from "react-native";
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
  /** Classes of the row (padding, the logged tint). */
  className?: string;
  disabled?: boolean;
  /** Shown under the row, e.g. when saving the set failed. */
  error?: string | null;
  hasWeight: boolean;
  isDone?: boolean;
  isEditing?: boolean;
  /** The row's cells before the inputs: the set number and PREVIOUS. */
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

const CELL_CLASS =
  "min-h-10 native:min-h-10 w-18 rounded-lg border-continuous px-1 text-center font-ibm-plex-mono text-body";

/** A logged value, shown in place of its input until the set is edited. */
function LoggedValue({ value }: { value?: string }) {
  return (
    <View className="min-h-10 w-18 items-center justify-center">
      <Text
        className="font-ibm-plex-mono-semibold text-body"
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * A set row: `leading` cells, then KG, REPS and the check, with any error
 * under the row. A set to log shows inputs with the recommended values as
 * placeholders; a logged set shows its values and a check that opens it for
 * editing.
 */
export default function WorkoutSessionExerciseSetForm({
  className,
  onSubmit,
  onEdit,
  hasWeight = true,
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
  const inputClass = cn(
    CELL_CLASS,
    isFormDisabled
      ? "bg-foreground/5 opacity-60"
      : "border border-input bg-foreground/5"
  );

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
  // set may have changed since, e.g. by the Coach).
  const startEditing = useCallback(() => {
    form.reset({ reps: "", weight: "" });
    onEdit();
  }, [form, onEdit]);

  const renderWeightField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<
        WorkoutSessionExerciseSetFormInput,
        "weight"
      >;
    }) => (
      <Input
        accessibilityLabel={`Set ${setIndex} weight`}
        className={inputClass}
        editable={!isFormDisabled}
        keyboardType="decimal-pad"
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={recommendedValues?.weight}
        selectTextOnFocus
        testID={`set-weight-input-${setIndex}`}
        value={value}
      />
    ),
    [inputClass, isFormDisabled, recommendedValues?.weight, setIndex]
  );

  const renderRepsField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<WorkoutSessionExerciseSetFormInput, "reps">;
    }) => (
      <Input
        accessibilityLabel={`Set ${setIndex} reps`}
        autoCapitalize="none"
        className={inputClass}
        editable={!isFormDisabled}
        keyboardType="number-pad"
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={recommendedValues?.reps}
        selectTextOnFocus
        testID={`set-reps-input-${setIndex}`}
        value={value}
      />
    ),
    [inputClass, isFormDisabled, recommendedValues?.reps, setIndex]
  );

  const { errors } = form.formState;

  return (
    <View className={cn("gap-1", className)}>
      <View className="flex-row items-center gap-2">
        {leading}
        {hasWeight ? (
          showsLoggedValues ? (
            <LoggedValue value={recommendedValues?.weight} />
          ) : (
            <Controller
              control={form.control}
              name="weight"
              render={renderWeightField}
            />
          )
        ) : null}
        {showsLoggedValues ? (
          <LoggedValue value={recommendedValues?.reps} />
        ) : (
          <Controller
            control={form.control}
            name="reps"
            render={renderRepsField}
          />
        )}

        <View
          className={cn(
            "w-11 items-center",
            disabled && !showsLoggedValues && "opacity-40"
          )}
        >
          {showsLoggedValues ? (
            <Button
              accessibilityHint="Opens the set for editing"
              accessibilityLabel={`Edit set ${setIndex}`}
              onPress={startEditing}
              shape="pill"
              size="icon"
              systemImage="checkmark"
              testID={`edit-set-button-${setIndex}`}
              variant="ghost"
            />
          ) : (
            // The next set to log carries the screen's one lime action.
            <Button
              accessibilityLabel={`Log set ${setIndex}`}
              disabled={disabled}
              onPress={submit}
              shape="pill"
              size="icon"
              systemImage="checkmark"
              testID={`log-set-button-${setIndex}`}
              variant={disabled ? "secondary" : "default"}
            />
          )}
        </View>
      </View>
      {errors.weight ? (
        <ErrorMessage>{errors.weight.message}</ErrorMessage>
      ) : null}
      {errors.reps ? <ErrorMessage>{errors.reps.message}</ErrorMessage> : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </View>
  );
}
