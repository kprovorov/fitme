import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import {
  Controller,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { z } from "zod";
import {
  formatSetWeight,
  setRepsField,
  setWeightField,
} from "~/lib/set-inputs";
import { Button } from "../ui/button";
import { ErrorMessage } from "../ui/error-message";
import { HStack } from "../ui/hstack";
import { Input } from "../ui/input";
import { VStack } from "../ui/vstack";

interface WorkoutSessionExerciseSetFormProps {
  disabled?: boolean;
  hasWeight: boolean;
  isDone?: boolean;
  isEditing?: boolean;
  onEdit: () => void;
  onSubmit: (
    values: WorkoutSessionExerciseSetFormValues
  ) => void | Promise<void>;
  recommendedValues?: WorkoutSessionExerciseSetFormInput;
  setIndex?: number;
}

/** What the fields hold. */
type WorkoutSessionExerciseSetFormInput = z.input<typeof formSchema>;
/** The parsed set: `null` for an empty field (the recommended value). */
export type WorkoutSessionExerciseSetFormValues = z.output<typeof formSchema>;

const formSchema = z.object({
  reps: setRepsField,
  weight: setWeightField,
});

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
        className="h-10 native:h-10 w-full text-center font-bold"
        editable={!isFormDisabled}
        keyboardType="decimal-pad"
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={recommendedValues?.weight}
        testID={`set-weight-input-${setIndex}`}
        value={value}
      />
    ),
    [isFormDisabled, recommendedValues?.weight, setIndex]
  );

  const renderRepsField = useCallback(
    ({
      field: { onChange, onBlur, value },
    }: {
      field: ControllerRenderProps<WorkoutSessionExerciseSetFormInput, "reps">;
    }) => (
      <Input
        autoCapitalize="none"
        className="h-10 native:h-10 w-full text-center font-bold"
        editable={!isFormDisabled}
        keyboardType="number-pad"
        onBlur={onBlur}
        onChangeText={onChange}
        placeholder={recommendedValues?.reps}
        testID={`set-reps-input-${setIndex}`}
        value={value}
      />
    ),
    [isFormDisabled, recommendedValues?.reps, setIndex]
  );

  return (
    <VStack className="flex-1 gap-xs">
      <HStack className="flex-1 justify-between gap-xs">
        {hasWeight ? (
          <HStack className="flex-1">
            <Controller
              control={form.control}
              name="weight"
              render={renderWeightField}
            />
          </HStack>
        ) : null}
        <HStack className="flex-1">
          <Controller
            control={form.control}
            name="reps"
            render={renderRepsField}
          />
        </HStack>

        <HStack className="w-10 flex-none">
          {isDone && !isEditing ? (
            <Button
              onPress={onEdit}
              shape="pill"
              size="icon-xs"
              systemImage="pencil"
              variant="ghost"
            />
          ) : (
            <Button
              disabled={disabled}
              onPress={submit}
              shape="pill"
              size="icon-xs"
              systemImage="checkmark"
              testID={`log-set-button-${setIndex}`}
            />
          )}
        </HStack>
      </HStack>
      {form.formState.errors.weight ? (
        <ErrorMessage>{form.formState.errors.weight.message}</ErrorMessage>
      ) : null}
      {form.formState.errors.reps ? (
        <ErrorMessage>{form.formState.errors.reps.message}</ErrorMessage>
      ) : null}
    </VStack>
  );
}
