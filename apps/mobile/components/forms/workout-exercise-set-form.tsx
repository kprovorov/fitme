import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import {
  Controller,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Text } from "../ui/text";

interface WorkoutSessionExerciseSetFormProps {
  disabled?: boolean;
  hasWeight: boolean;
  isDone?: boolean;
  isEditing?: boolean;
  onEdit: () => void;
  onSubmit: (
    values: WorkoutSessionExerciseSetFormValues
  ) => void | Promise<void>;
  recommendedValues?: z.infer<typeof formSchema>;
  setIndex?: number;
}

export type WorkoutSessionExerciseSetFormValues = z.infer<typeof formSchema>;

// Optional: react-hook-form reports a field as `undefined` while the form is
// disabled, and a set row is re-enabled once the sets before it are logged.
// An empty field falls back to the shown placeholder.
const formSchema = z.object({
  reps: z.string().optional(),
  weight: z.string().optional(),
});

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
 * The KG, REPS and check cells of a set row. A set to log shows inputs with
 * the recommended values as placeholders; a logged set shows its values and a
 * check that opens it for editing.
 */
export default function WorkoutSessionExerciseSetForm({
  onSubmit,
  onEdit,
  hasWeight = true,
  recommendedValues,
  disabled,
  isDone,
  isEditing,
  setIndex = 0,
}: WorkoutSessionExerciseSetFormProps) {
  const form = useForm<WorkoutSessionExerciseSetFormValues>({
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

  const renderWeightField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<
        WorkoutSessionExerciseSetFormValues,
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
      field: ControllerRenderProps<WorkoutSessionExerciseSetFormValues, "reps">;
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

  return (
    <View className="flex-row items-center gap-2">
      {hasWeight &&
        (showsLoggedValues ? (
          <LoggedValue value={recommendedValues?.weight} />
        ) : (
          <Controller
            control={form.control}
            name="weight"
            render={renderWeightField}
          />
        ))}
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
            accessibilityLabel={`Set ${setIndex} logged`}
            onPress={onEdit}
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
            onPress={form.handleSubmit(onSubmit)}
            shape="pill"
            size="icon"
            systemImage="checkmark"
            testID={`log-set-button-${setIndex}`}
            variant={disabled ? "secondary" : "default"}
          />
        )}
      </View>
    </View>
  );
}
