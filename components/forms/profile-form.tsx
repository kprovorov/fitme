import React, { useState } from "react";
import { VStack } from "../ui/vstack";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { H4 } from "../ui/typography";
import { Controller } from "react-hook-form";
import { Pressable, View, TouchableWithoutFeedback } from "react-native";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { Button } from "../ui/button";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { Picker } from "@react-native-picker/picker";
import { WheelSelect } from "../ui/wheel-select";

interface ProfileFormProps {
  onSubmit: (values: ProfileFormValues) => Promise<void>;
  defaultValues?: ProfileFormValues;
}

export type ProfileFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  gender: z.enum(["male", "female"]),
  age: z.coerce.number().min(4).max(150),
  weight: z.coerce.number().min(0).max(500),
  height: z.coerce.number().min(0).max(500),
});

export default function ProfileForm({
  onSubmit,
  defaultValues,
}: ProfileFormProps) {
  const { data: user } = useCurrentUserQuery();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const genderOptions = [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
  ];

  const [heightFeet, setHeightFeet] = useState(0);
  const [heightInches, setHeightInches] = useState(0);
  const [isHeightFocused, setIsHeightFocused] = useState(false);

  return (
    <TouchableWithoutFeedback onPress={() => setIsHeightFocused(false)}>
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
          <H4>Body Measurements</H4>
          <Text className="text-sm text-muted-foreground">
            What is your body measurements?
          </Text>
        </VStack>

        <VStack className="gap-0 items-stretch rounded-md overflow-hidden">
          <VStack className="gap-0 items-stretch">
            <Controller
              control={form.control}
              name="age"
              render={({ field: { onChange, onBlur, value } }) => (
                <WheelSelect
                  label="Age"
                  value={value?.toString()}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  wheels={[
                    {
                      options: Array.from({ length: 100 }, (_, i) => i).map(
                        (option) => ({
                          label: `${option}`,
                          value: option.toString(),
                        })
                      ),
                      selectedValue: value?.toString(),
                      onValueChange: (itemValue, itemIndex) => {
                        onChange(parseInt(itemValue.toString()));
                      },
                    },
                  ]}
                />
              )}
            />
            {form.formState.errors.age && (
              <Text className="text-red-500">
                {form.formState.errors.age.message}
              </Text>
            )}
          </VStack>

          <VStack className="gap-0 items-stretch border-t border-foreground/5">
            <Controller
              control={form.control}
              name="weight"
              render={({ field: { onChange, onBlur, value } }) => (
                <WheelSelect
                  label="Weight"
                  value={`${value} ${
                    user?.measurement_system === "metric" ? "kg" : "lbs"
                  }`}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  wheels={[
                    {
                      options: Array.from({ length: 100 }, (_, i) => i).map(
                        (option) => ({
                          label: `${option} ${
                            user?.measurement_system === "metric" ? "kg" : "lbs"
                          }`,
                          value: option.toString(),
                        })
                      ),
                      selectedValue: value?.toString(),
                      onValueChange: (itemValue, itemIndex) => {
                        if (itemValue) {
                          onChange(parseInt(itemValue.toString()));
                        }
                      },
                    },
                  ]}
                />
              )}
            />
            {form.formState.errors.weight && (
              <Text className="text-red-500">
                {form.formState.errors.weight.message}
              </Text>
            )}
          </VStack>

          <VStack className="gap-0 items-stretch border-t border-foreground/5">
            <Controller
              control={form.control}
              name="height"
              render={({ field: { onChange, onBlur, value } }) => (
                <WheelSelect
                  label="Height"
                  value={`${heightFeet}′ ${heightInches}″`}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  wheels={[
                    {
                      options: Array.from({ length: 10 }, (_, i) => i).map(
                        (option) => ({
                          label: `${option}′`,
                          value: option.toString(),
                        })
                      ),
                      selectedValue: heightFeet.toString(),
                      onValueChange: (itemValue, itemIndex) => {
                        setHeightFeet(parseInt(itemValue.toString()));
                        if (itemValue) {
                          onChange(
                            parseInt(itemValue.toString()) * 12 +
                              parseInt(heightInches.toString())
                          );
                        }
                      },
                    },
                    {
                      options: Array.from({ length: 12 }, (_, i) => i).map(
                        (option) => ({
                          label: `${option}″`,
                          value: option.toString(),
                        })
                      ),
                      selectedValue: heightInches.toString(),
                      onValueChange: (itemValue, itemIndex) => {
                        setHeightInches(parseInt(itemValue.toString()));
                        if (itemValue) {
                          onChange(
                            parseInt(heightFeet.toString()) * 12 +
                              parseInt(itemValue.toString())
                          );
                        }
                      },
                    },
                  ]}
                />
              )}
            />
            {form.formState.errors.height && (
              <Text className="text-red-500">
                {form.formState.errors.height.message}
              </Text>
            )}
          </VStack>
        </VStack>

        {/* <Button
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
        </Button> */}
      </VStack>
    </TouchableWithoutFeedback>
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
