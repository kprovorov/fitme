import React from "react";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Button, TextInput } from "react-native";

interface PlannerFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => void;
}

export type PlannerFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  gender: z.enum(["male", "female"]),
  age: z.coerce.number().min(18).max(100),
  goal: z.enum(["lose_weight", "gain_muscle", "improve_health"]),
  weight: z.coerce.number().min(30).max(200),
  height: z.coerce.number().min(100).max(250),
  location: z.enum(["gym", "home"]),
  frequency: z.coerce.number().min(1).max(7),
});

export default function PlannerForm({ onSubmit }: PlannerFormProps) {
  const form = useForm<PlannerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      gender: "male",
      age: 20,
      goal: "lose_weight",
      weight: 70,
      height: 170,
      location: "gym",
      frequency: 3,
    },
  });

  const genderField = (
    <Controller
      control={form.control}
      name="gender"
      render={({ field: { onChange, onBlur, value } }) => (
        <TextInput
          placeholder="Gender"
          onChangeText={onChange}
          onBlur={onBlur}
          value={value}
        />
      )}
    />
  );

  const ageField = (
    <Controller
      control={form.control}
      name="age"
      render={({ field: { onChange, onBlur, value } }) => (
        <TextInput
          placeholder="Age"
          onChangeText={onChange}
          onBlur={onBlur}
          value={value.toString()}
          keyboardType="numeric"
        />
      )}
    />
  );

  const goalField = (
    <Controller
      control={form.control}
      name="goal"
      render={({ field: { onChange, onBlur, value } }) => (
        <TextInput
          placeholder="Goal"
          onChangeText={onChange}
          onBlur={onBlur}
          value={value}
        />
      )}
    />
  );

  const weightField = (
    <Controller
      control={form.control}
      name="weight"
      render={({ field: { onChange, onBlur, value } }) => (
        <TextInput
          placeholder="Weight"
          onChangeText={onChange}
          onBlur={onBlur}
          value={value.toString()}
          keyboardType="numeric"
        />
      )}
    />
  );

  const heightField = (
    <Controller
      control={form.control}
      name="height"
      render={({ field: { onChange, onBlur, value } }) => (
        <TextInput
          placeholder="Height"
          onChangeText={onChange}
          onBlur={onBlur}
          value={value.toString()}
          keyboardType="numeric"
        />
      )}
    />
  );

  const locationField = (
    <Controller
      control={form.control}
      name="location"
      render={({ field: { onChange, onBlur, value } }) => (
        <TextInput
          placeholder="Location"
          onChangeText={onChange}
          onBlur={onBlur}
          value={value}
        />
      )}
    />
  );

  const frequencyField = (
    <Controller
      control={form.control}
      name="frequency"
      render={({ field: { onChange, onBlur, value } }) => (
        <TextInput
          placeholder="Frequency"
          onChangeText={onChange}
          onBlur={onBlur}
          value={value.toString()}
          keyboardType="numeric"
        />
      )}
    />
  );

  return (
    <ThemedView>
      <ThemedText>
        I'm a {genderField}, {ageField} y.o, and I want to {goalField}
      </ThemedText>
      <ThemedText>
        My current weight is {weightField} kg, height is {heightField} cm. I
        want to exercise at {locationField} {frequencyField} times a week
      </ThemedText>
      <Button title="Submit" onPress={form.handleSubmit(onSubmit)} />
    </ThemedView>
  );
}
