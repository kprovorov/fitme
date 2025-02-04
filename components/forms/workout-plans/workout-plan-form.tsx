import React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, FieldErrors, useForm } from "react-hook-form";
import { View } from "react-native";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Text } from "~/components/ui/text";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { VStack } from "~/components/ui/vstack";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";

interface WorkoutPlanFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
  errors?: FieldErrors<WorkoutPlanFormValues>;
}

export type WorkoutPlanFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  goal: z.enum(["lose_weight", "gain_muscle", "improve_health"]),
  place: z.enum(["gym", "home"]),
  frequency: z.coerce.number().min(1).max(7),
});

export default function WorkoutPlanForm({
  onSubmit,
  errors,
}: WorkoutPlanFormProps) {
  const form = useForm<WorkoutPlanFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      goal: undefined,
      place: undefined,
      frequency: undefined,
    },
    errors,
  });

  const goalOptions = [
    { label: "Lose weight", value: "lose_weight" },
    { label: "Gain muscle", value: "gain_muscle" },
    { label: "Improve health", value: "improve_health" },
  ];

  const placeOptions = [
    { label: "Gym", value: "gym" },
    { label: "Home", value: "home", disabled: true },
  ];

  return (
    <VStack className="items-stretch w-full">
      <Controller
        control={form.control}
        name="goal"
        render={({ field: { onChange, onBlur, value } }) => (
          <Select
            disabled={form.formState.isSubmitting}
            value={goalOptions.find((option) => option.value === value)}
            onValueChange={(value) => onChange(value?.value)}
          >
            <SelectTrigger className="w-32">
              <SelectValue
                placeholder="Goal"
                className="text-muted-foreground"
              />
            </SelectTrigger>
            <SelectContent>
              {goalOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  label={option.label}
                  value={option.value}
                />
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {form.formState.errors.goal && (
        <Text className="text-red-500">
          {form.formState.errors.goal.message}
        </Text>
      )}

      <Controller
        control={form.control}
        name="place"
        render={({ field: { onChange, onBlur, value } }) => (
          <Select
            value={placeOptions.find((option) => option.value === value)}
            onValueChange={(value) => onChange(value?.value)}
            disabled={form.formState.isSubmitting}
          >
            <SelectTrigger className="w-32">
              <SelectValue
                placeholder="Place"
                className="text-muted-foreground"
              />
            </SelectTrigger>
            <SelectContent>
              {placeOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  label={
                    option.disabled ? `${option.label} (Soon)` : option.label
                  }
                  value={option.value}
                  disabled={option.disabled}
                />
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {form.formState.errors.place && (
        <Text className="text-red-500">
          {form.formState.errors.place.message}
        </Text>
      )}

      <Controller
        control={form.control}
        name="frequency"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            className="w-24 text-center"
            placeholder="Frequency"
            onChangeText={onChange}
            onBlur={onBlur}
            value={value?.toString()}
            keyboardType="numeric"
            editable={!form.formState.isSubmitting}
          />
        )}
      />
      {form.formState.errors.frequency && (
        <Text className="text-red-500">
          {form.formState.errors.frequency.message}
        </Text>
      )}

      <Button
        disabled={form.formState.isSubmitting}
        onPress={form.handleSubmit(onSubmit)}
      >
        {form.formState.isSubmitting ? (
          <View className="animate-spin">
            <LoaderCircle className="w-4 h-4 color-white" />
          </View>
        ) : (
          <Text>Get my plan! 💪</Text>
        )}
      </Button>
    </VStack>
  );
}
