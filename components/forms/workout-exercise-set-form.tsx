import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { HStack } from "../ui/hstack";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Check } from "~/lib/icons/Check";
import { Pencil } from "~/lib/icons/Pencil";
import { VStack } from "../ui/vstack";
import { ErrorMessage } from "../ui/error-message";

interface WorkoutSessionExerciseSetFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
  onEdit: () => void;
  hasWeight: boolean;
  recommendedValues?: z.infer<typeof formSchema>;
  disabled?: boolean;
  isDone?: boolean;
  isEditing?: boolean;
}

export type WorkoutSessionExerciseSetFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  weight: z.string(),
  reps: z.string(),
});

export default function WorkoutSessionExerciseSetForm({
  onSubmit,
  onEdit,
  hasWeight = true,
  recommendedValues,
  disabled,
  isDone,
  isEditing,
}: WorkoutSessionExerciseSetFormProps) {
  const form = useForm<WorkoutSessionExerciseSetFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      weight: "",
      reps: "",
    },
    disabled,
  });

  return (
    <VStack className="flex-1 gap-xs">
      <HStack className="justify-between gap-xs flex-1">
        {hasWeight && (
          <HStack className="flex-1">
            <Controller
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  editable={!form.formState.disabled}
                  placeholder={recommendedValues?.weight}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  keyboardType="decimal-pad"
                  className="w-full text-center font-bold h-10 native:h-10"
                />
              )}
              name="weight"
            />
          </HStack>
        )}
        <HStack className="flex-1">
          <Controller
            control={form.control}
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                editable={!form.formState.disabled}
                placeholder={recommendedValues?.reps}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                keyboardType="number-pad"
                autoCapitalize="none"
                className="w-full text-center font-bold h-10 native:h-10"
              />
            )}
            name="reps"
          />
        </HStack>

        <HStack className="flex-none w-10">
          {isDone && !isEditing ? (
            <Button
              onPress={onEdit}
              size="icon-xs"
              variant="ghost"
              shape="pill"
            >
              <Pencil className="text-muted-foreground" size={16} />
            </Button>
          ) : (
            <Button
              onPress={form.handleSubmit(onSubmit)}
              disabled={disabled}
              size="icon-xs"
              shape="pill"
            >
              <Check className="text-primary-foreground" size={16} />
            </Button>
          )}
        </HStack>
      </HStack>
      {form.formState.errors.weight && (
        <ErrorMessage>{form.formState.errors.weight.message}</ErrorMessage>
      )}
      {form.formState.errors.reps && (
        <ErrorMessage>{form.formState.errors.reps.message}</ErrorMessage>
      )}
    </VStack>
  );
}
