import React from "react";
import { VStack } from "../ui/vstack";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { H4 } from "../ui/typography";
import { Controller } from "react-hook-form";
import { Pressable, View } from "react-native";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { Button } from "../ui/button";
import { ArrowRight } from "~/lib/icons/ArrowRight";

interface ProfileFormProps {
  onSubmit: (values: ProfileFormValues) => Promise<void>;
  defaultValues?: ProfileFormValues;
}

export type ProfileFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  gender: z.enum(["male", "female"]),
  age: z.coerce.number().min(18).max(100),
  weight: z.coerce.number().min(30).max(200),
  height: z.coerce.number().min(100).max(250),
});

export default function ProfileForm({
  onSubmit,
  defaultValues,
}: ProfileFormProps) {
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const genderOptions = [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
  ];

  return (
    <VStack className="items-stretch w-full">
      <VStack className="gap-0 justify-start items-start">
        <H4>Gender</H4>
        <Text className="text-sm text-muted-foreground">
          What is your gender?
        </Text>
      </VStack>

      <Controller
        control={form.control}
        name="gender"
        render={({ field: { onChange, onBlur, value } }) => (
          <RadioGroup
            value={value}
            onValueChange={onChange}
            className="flex flex-row gap-4 justify-stretch items-stretch"
          >
            {genderOptions.map((option) => (
              <RadioGroupItemWithLabel
                key={option.value}
                value={option.value}
                label={option.label}
                disabled={false}
                isSelected={option.value === value}
                onLabelPress={() => onChange(option.value)}
              />
            ))}
          </RadioGroup>
        )}
      />
      {form.formState.errors.gender && (
        <Text className="text-red-500">
          {form.formState.errors.gender.message}
        </Text>
      )}

      <VStack className="gap-0 justify-start items-start">
        <H4>Age</H4>
        <Text className="text-sm text-muted-foreground">What is your age?</Text>
      </VStack>

      <Controller
        control={form.control}
        name="age"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            value={value?.toString()}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder="Age"
            keyboardType="numeric"
          />
        )}
      />
      {form.formState.errors.age && (
        <Text className="text-red-500">
          {form.formState.errors.age.message}
        </Text>
      )}

      <VStack className="gap-0 justify-start items-start">
        <H4>Weight</H4>
        <Text className="text-sm text-muted-foreground">
          What is your weight in kg?
        </Text>
      </VStack>

      <Controller
        control={form.control}
        name="weight"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            value={value?.toString()}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder="Weight"
            keyboardType="numeric"
          />
        )}
      />
      {form.formState.errors.weight && (
        <Text className="text-red-500">
          {form.formState.errors.weight.message}
        </Text>
      )}

      <VStack className="gap-0 justify-start items-start">
        <H4>Height</H4>
        <Text className="text-sm text-muted-foreground">
          What is your height in cm?
        </Text>
      </VStack>

      <Controller
        control={form.control}
        name="height"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            value={value?.toString()}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder="Height"
            keyboardType="numeric"
          />
        )}
      />
      {form.formState.errors.height && (
        <Text className="text-red-500">
          {form.formState.errors.height.message}
        </Text>
      )}

      <Button
        disabled={form.formState.isSubmitting}
        onPress={form.handleSubmit(onSubmit)}
      >
        {form.formState.isSubmitting ? (
          <View className="animate-spin">
            <LoaderCircle size={16} className="text-black" />
          </View>
        ) : (
          <HStack className="gap-2">
            <Text>Next</Text>
            <ArrowRight size={16} className="text-black" />
          </HStack>
        )}
      </Button>
    </VStack>
  );
}

function RadioGroupItemWithLabel({
  value,
  label,
  disabled,
  isSelected,
  onLabelPress,
}: {
  value: string;
  label: string;
  disabled: boolean;
  isSelected: boolean;
  onLabelPress: () => void;
}) {
  return (
    <Pressable
      className={`flex flex-row gap-2 bg-card rounded-lg p-4 flex-1 justify-start items-center border-2 ${
        isSelected ? "border-primary" : "border-transparent"
      } ${disabled ? "opacity-50" : ""}`}
      onPress={() => !disabled && onLabelPress()}
    >
      <RadioGroupItem
        aria-labelledby={`label-for-${value}`}
        value={value}
        disabled={disabled}
      />
      <Label
        nativeID={`label-for-${value}`}
        className={`text-base text-white font-nunito-sans-bold ${
          disabled ? "opacity-50" : ""
        }`}
        onPress={() => !disabled && onLabelPress()}
      >
        {label}
      </Label>
    </Pressable>
  );
}
