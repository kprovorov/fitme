import React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, View } from "react-native";
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
import { VStack } from "~/components/ui/vstack";
import { HStack } from "~/components/ui/hstack";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";

interface PlannerFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
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
    { label: "Men", value: "male" },
    { label: "Women", value: "female" },
  ];

  const genderField = (
    <Controller
      control={form.control}
      name="gender"
      render={({ field: { onChange, onBlur, value } }) => (
        <Select
          disabled={form.formState.isSubmitting}
          className="min-w-[100px]"
          value={genderOptions.find((option) => option.value === value)}
          onValueChange={(value) => onChange(value?.value)}
        >
          <SelectTrigger>
            <SelectValue
              className="text-foreground text-sm native:text-lg"
              placeholder="Select a fruit"
            />
          </SelectTrigger>
          <SelectContent>
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
          editable={!form.formState.isSubmitting}
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
          disabled={form.formState.isSubmitting}
          value={goalOptions.find((option) => option.value === value)}
          onValueChange={(value) => onChange(value?.value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Goal" />
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
          editable={!form.formState.isSubmitting}
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
          editable={!form.formState.isSubmitting}
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
          disabled={form.formState.isSubmitting}
        >
          <SelectTrigger>
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
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
          editable={!form.formState.isSubmitting}
        />
      )}
    />
  );

  return (
    <VStack className="items-stretch">
      <HStack className="justify-stretch flex-wrap">
        <Text className="text-xl font-semibold">I'm a</Text>
        {genderField}
        <Text className="text-xl font-semibold">,</Text>
        {ageField}
        <Text className="text-xl font-semibold">y.o, and I want to</Text>
        {goalField}
        <Text className="text-xl font-semibold">My current weight is</Text>
        {weightField}
        <Text className="text-xl font-semibold">kg, height is</Text>
        {heightField}
        <Text className="text-xl font-semibold">cm. I want to exercise at</Text>
        {locationField}
        {frequencyField}
        <Text className="text-xl font-semibold">times a week</Text>
      </HStack>

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
