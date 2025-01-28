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
    <HStack className="items-center justify-between w-full">
      <HStack>
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
              className="min-w-20 text-center"
            />
          )}
          name="weight"
        />
        <Text>kg</Text>
      </HStack>
      <HStack>
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
              className="min-w-20 text-center"
            />
          )}
          name="repeats"
        />
        <Text>reps</Text>
      </HStack>
      <Button
        onPress={form.handleSubmit(onSubmit)}
        className="bg-green-500 rounded-full text-white"
        disabled={disabled}
      >
        <Check className="text-white" />
      </Button>
    </HStack>
  );
}
