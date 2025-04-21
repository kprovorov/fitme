import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { HStack } from "../ui/hstack";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Check } from "~/lib/icons/Check";
import { Text } from "../ui/text";
import { Pencil } from "~/lib/icons/Pencil";
import { VStack } from "../ui/vstack";
import { ErrorMessage } from "../ui/error-message";

interface WorkoutSessionExerciseSetFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
  onEdit: () => void;
  hasWeight: boolean;
  defaultValues?: z.infer<typeof formSchema>;
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
  defaultValues,
  disabled,
  isDone,
  isEditing,
}: WorkoutSessionExerciseSetFormProps) {
  const form = useForm<WorkoutSessionExerciseSetFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues ?? {
      weight: "0",
      reps: "0",
    },
    disabled,
  });

  return (
    <VStack className="flex-1">
      <HStack className="justify-between flex-1">
        {hasWeight && (
          <HStack className="flex-1">
            <Controller
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  editable={!form.formState.disabled}
                  placeholder="Weight"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  keyboardType="decimal-pad"
                  className="w-full text-center font-bold"
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
                placeholder="Repeats"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                keyboardType="number-pad"
                autoCapitalize="none"
                className="w-full text-center font-bold"
              />
            )}
            name="reps"
          />
        </HStack>

        <HStack className="flex-none w-10">
          {isDone && !isEditing ? (
            <Button
              onPress={onEdit}
              className="rounded-full"
              size="icon"
              variant="secondary"
            >
              <Pencil className="text-muted-foreground" size={16} />
            </Button>
          ) : (
            <Button
              onPress={form.handleSubmit(onSubmit)}
              className="rounded-full"
              disabled={disabled}
              size="icon"
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
