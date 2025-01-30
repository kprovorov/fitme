import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { HStack } from "../ui/hstack";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Check } from "~/lib/icons/Check";
import { Text } from "../ui/text";

interface WorkoutExerciseSetFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
  defaultValues?: z.infer<typeof formSchema>;
  disabled?: boolean;
}

export type WorkoutExerciseSetFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  weight: z.coerce.number().min(0),
  repeats: z.coerce.number().min(0),
});

export default function WorkoutExerciseSetForm({
  onSubmit,
  defaultValues,
  disabled,
}: WorkoutExerciseSetFormProps) {
  const form = useForm<WorkoutExerciseSetFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues ?? {
      weight: 0,
      repeats: 0,
    },
  });
  return (
    <HStack className="justify-between flex-1">
      <HStack className="flex-1">
        <Controller
          control={form.control}
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              editable={!form.formState.isSubmitting && !disabled}
              placeholder="Weight"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value.toString()}
              keyboardType="number-pad"
              autoCapitalize="none"
              className="w-full text-center font-bold"
            />
          )}
          name="weight"
        />
      </HStack>
      <HStack className="flex-1">
        <Controller
          control={form.control}
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              editable={!form.formState.isSubmitting && !disabled}
              placeholder="Repeats"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value.toString()}
              keyboardType="number-pad"
              autoCapitalize="none"
              className="w-full text-center font-bold"
            />
          )}
          name="repeats"
        />
      </HStack>

      <HStack className="flex-none w-10">
        <Button
          onPress={form.handleSubmit(onSubmit)}
          className="rounded-full"
          disabled={disabled}
          size="icon"
        >
          <Check className="text-primary-foreground" />
        </Button>
      </HStack>
    </HStack>
  );
}
