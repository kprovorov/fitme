import React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Text } from "~/components/ui/text";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";

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

  const genderOptions = [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
  ];

  const genderField = (
    <Controller
      control={form.control}
      name="gender"
      render={({ field: { onChange, onBlur, value } }) => (
        <Select
          value={genderOptions.find((option) => option.value === value)}
          onValueChange={(value) => onChange(value?.value)}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue
              className="text-foreground text-sm native:text-lg"
              placeholder="Select a fruit"
            />
          </SelectTrigger>
          <SelectContent className="w-[250px]">
            <SelectGroup>
              {genderOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  label={option.label}
                  value={option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    />
  );

  const ageField = (
    <Controller
      control={form.control}
      name="age"
      render={({ field: { onChange, onBlur, value } }) => (
        <Input
          placeholder="Age"
          onChangeText={onChange}
          onBlur={onBlur}
          value={value.toString()}
          keyboardType="numeric"
        />
      )}
    />
  );

  const goalOptions = [
    { label: "Lose weight", value: "lose_weight" },
    { label: "Gain muscle", value: "gain_muscle" },
    { label: "Improve health", value: "improve_health" },
  ];

  const goalField = (
    <Controller
      control={form.control}
      name="goal"
      render={({ field: { onChange, onBlur, value } }) => (
        <Select
          value={goalOptions.find((option) => option.value === value)}
          onValueChange={(value) => onChange(value?.value)}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Goal" />
          </SelectTrigger>
          <SelectContent className="w-[250px]">
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
  );

  const weightField = (
    <Controller
      control={form.control}
      name="weight"
      render={({ field: { onChange, onBlur, value } }) => (
        <Input
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
        <Input
          placeholder="Height"
          onChangeText={onChange}
          onBlur={onBlur}
          value={value.toString()}
          keyboardType="numeric"
        />
      )}
    />
  );

  const locationOptions = [
    { label: "Gym", value: "gym" },
    { label: "Home", value: "home" },
  ];

  const locationField = (
    <Controller
      control={form.control}
      name="location"
      render={({ field: { onChange, onBlur, value } }) => (
        <Select
          value={locationOptions.find((option) => option.value === value)}
          onValueChange={(value) => onChange(value?.value)}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent className="w-[250px]">
            {locationOptions.map((option) => (
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
  );

  const frequencyField = (
    <Controller
      control={form.control}
      name="frequency"
      render={({ field: { onChange, onBlur, value } }) => (
        <Input
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
    <View className="flex flex-col gap-4">
      <Text>I'm a</Text>
      {genderField}
      
      {ageField}
      <Text>y.o, and I want to</Text>
      {goalField}
      <Text>My current weight is</Text>
      {weightField}
      <Text>kg, height is</Text>
      {heightField}
      <Text>cm. I want to exercise at</Text>
      {locationField}
      {frequencyField}
      <Text>times a week</Text>
      <Button onPress={form.handleSubmit(onSubmit)}>
        <Text>Submit</Text>
      </Button>
    </View>
  );
}
