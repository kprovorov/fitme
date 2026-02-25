import { zodResolver } from "@hookform/resolvers/zod";
import Slider from "@react-native-community/slider";
import { router, Stack } from "expo-router";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { z } from "zod";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Spinner } from "~/components/ui/spinner";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import { H4, Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { Flame } from "~/lib/icons/Flame";
import { HeartPulse } from "~/lib/icons/HeartPulse";
import {
  getExperienceLevelDisclaimer,
  getExperienceLevelLabel,
} from "~/lib/labels";
import { experienceLevels, goals, places } from "~/lib/models";

export type PlanFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  goal: z.enum(goals),
  place: z.enum(places),
  frequency: z.coerce.number().min(1).max(7),
  experience_level: z.enum(experienceLevels),
  workout_duration: z.coerce.number().min(1).max(120),
  note: z.string().optional(),
});

export default function PlannerScreen() {
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      place: "gym",
      workout_duration: 60,
    },
  });

  const goalOptions = [
    { label: "Lose weight", value: "fat-loss", icon: Flame },
    { label: "Gain muscle", value: "muscle-gain", icon: BicepsFlexed },
    {
      label: "Improve health",
      value: "general-health-fitness",
      icon: HeartPulse,
    },
  ];

  const placeOptions = [
    { label: "Gym", value: "gym" },
    { label: "Home", value: "home", disabled: true, badge: "Soon" },
  ];

  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: "Create workout plan",
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView edges={["top"]} className="flex-1">
          <KeyboardAwareScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            bottomOffset={24}
            keyboardShouldPersistTaps="handled"
          >
            <VStack
              style={{ paddingBottom: insets.bottom }}
              className="p-md items-center justify-center gap-4"
            >
              <VStack className="items-stretch w-full">
                <VStack className="gap-0 justify-start items-start">
                  <H4>Goal</H4>
                  <Text className="text-sm text-muted-foreground">
                    What is your goal?
                  </Text>
                </VStack>

                <Controller
                  control={form.control}
                  name="goal"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <RadioGroup
                      value={value}
                      onValueChange={onChange}
                      className="flex flex-row gap-4 justify-stretch items-stretch"
                    >
                      {goalOptions.map((option) => (
                        <RadioGroupItemTileWithIcon
                          key={option.value}
                          value={option.value}
                          label={option.label}
                          disabled={false}
                          isSelected={option.value === value}
                          onLabelPress={() => onChange(option.value)}
                          icon={option.icon}
                        />
                      ))}
                    </RadioGroup>
                  )}
                />
                {form.formState.errors.goal && (
                  <Text className="text-red-500">
                    {form.formState.errors.goal.message}
                  </Text>
                )}

                <VStack className="gap-0 justify-start items-start">
                  <H4>Experience</H4>
                  <Text className="text-sm text-muted-foreground">
                    How much experience do you have?
                  </Text>
                </VStack>

                <Controller
                  control={form.control}
                  name="experience_level"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <RadioGroup
                      value={value}
                      onValueChange={onChange}
                      className="flex flex-col gap-4 justify-stretch items-stretch"
                    >
                      {experienceLevels.map((option) => (
                        <RadioGroupItemWithLabel
                          key={option}
                          value={option}
                          label={getExperienceLevelLabel(option)}
                          disabled={false}
                          isSelected={option === value}
                          onLabelPress={() => onChange(option)}
                          disclaimer={getExperienceLevelDisclaimer(option)}
                        />
                      ))}
                    </RadioGroup>
                  )}
                />
                {form.formState.errors.experience_level && (
                  <Text className="text-red-500">
                    {form.formState.errors.experience_level.message}
                  </Text>
                )}

                <VStack className="gap-0 justify-start items-stretch">
                  <HStack className="justify-between items-center">
                    <H4>Workout duration</H4>
                    <Text className="text-sm text-primary">
                      {form.watch("workout_duration")} minutes
                    </Text>
                  </HStack>
                  <Text className="text-sm text-muted-foreground">
                    How long do you want to workout?
                  </Text>
                </VStack>

                <Controller
                  control={form.control}
                  name="workout_duration"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Slider
                      style={{ width: "100%", height: 40 }}
                      minimumValue={30}
                      maximumValue={120}
                      minimumTrackTintColor="#C0FF38"
                      step={10}
                      value={value}
                      onValueChange={onChange}
                    />
                  )}
                />
                {form.formState.errors.workout_duration && (
                  <Text className="text-red-500">
                    {form.formState.errors.workout_duration.message}
                  </Text>
                )}

                <VStack className="gap-0 justify-start items-start">
                  <H4>Place</H4>
                  <Text className="text-sm text-muted-foreground">
                    Choose where you want to do your workouts
                  </Text>
                </VStack>

                <Controller
                  control={form.control}
                  name="place"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <RadioGroup
                      value={value}
                      onValueChange={onChange}
                      className="flex flex-row gap-4 justify-stretch items-stretch"
                    >
                      {placeOptions.map((option) => (
                        <RadioGroupItemWithLabel
                          key={option.value}
                          value={option.value}
                          label={option.label}
                          disabled={option.disabled ?? false}
                          badge={option.badge}
                          isSelected={option.value === value}
                          onLabelPress={() => onChange(option.value)}
                        />
                      ))}
                    </RadioGroup>
                  )}
                />
                {form.formState.errors.place && (
                  <Text className="text-red-500">
                    {form.formState.errors.place.message}
                  </Text>
                )}

                <VStack className="gap-0 justify-start items-start">
                  <H4>Frequency</H4>
                  <Text className="text-sm text-muted-foreground">
                    How many times per week do you want to workout?
                  </Text>
                </VStack>

                <Controller
                  control={form.control}
                  name="frequency"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <RadioGroup
                      value={value?.toString()}
                      onValueChange={onChange}
                      className="flex flex-row gap-4 justify-stretch items-stretch"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((option) => (
                        <RadioGroupItemTile
                          key={option}
                          value={option?.toString()}
                          label={option?.toString()}
                          disabled={false}
                          isSelected={option?.toString() === value?.toString()}
                          onLabelPress={() => onChange(option?.toString())}
                        />
                      ))}
                    </RadioGroup>
                  )}
                />
                {form.formState.errors.frequency && (
                  <Text className="text-red-500">
                    {form.formState.errors.frequency.message}
                  </Text>
                )}

                <VStack className="gap-0 justify-start items-start">
                  <H4>Custom note</H4>
                  <Text className="text-sm text-muted-foreground">
                    Add a custom note to your plan
                  </Text>
                </VStack>

                <Controller
                  control={form.control}
                  name="note"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Textarea
                      placeholder="e.g. I want to pay more attention to my abs"
                      value={value}
                      onChangeText={onChange}
                      className="h-48"
                    />
                  )}
                />
                {form.formState.errors.note && (
                  <Text className="text-red-500">
                    {form.formState.errors.note.message}
                  </Text>
                )}

                <VStack className="items-stretch gap-2">
                  <Button
                    disabled={form.formState.isSubmitting}
                    onPress={form.handleSubmit(async (values) => {
                      router.push({
                        pathname: "/planner/preview",
                        params: values,
                      });
                    })}
                  >
                    {form.formState.isSubmitting ? (
                      <Spinner size={16} className="text-black" />
                    ) : (
                      <Text>Get my plan!</Text>
                    )}
                  </Button>
                  {form.formState.isSubmitting && (
                    <VStack className="justify-center items-center gap-0">
                      <P className="font-bold text-center text-sm">
                        Hold on... AI is working hard to create your plan!
                      </P>
                      <Muted className="text-center text-sm">
                        This may take a couple of minutes.
                      </Muted>
                    </VStack>
                  )}
                </VStack>
              </VStack>
            </VStack>
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}

function RadioGroupItemWithLabel({
  value,
  label,
  disclaimer,
  disabled,
  badge,
  isSelected,
  onLabelPress,
}: {
  value: string;
  label: string;
  disclaimer?: string;
  disabled: boolean;
  badge?: string;
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
      <HStack className="flex-1 justify-between items-center p-0 gap-0">
        <VStack className="flex-1 items-start gap-0 p-0">
          <Label
            nativeID={`label-for-${value}`}
            className={`text-base text-white font-nunito-sans-bold ${
              disabled ? "opacity-50" : ""
            }`}
            onPress={() => !disabled && onLabelPress()}
          >
            {label}
          </Label>
          {!!disclaimer && <Muted className="text-sm">{disclaimer}</Muted>}
        </VStack>
        {badge && (
          <Badge variant="secondary">
            <Text>{badge}</Text>
          </Badge>
        )}
      </HStack>
    </Pressable>
  );
}

function RadioGroupItemTileWithIcon({
  value,
  label,
  icon,
  disabled,
  badge,
  isSelected,
  onLabelPress,
}: {
  value: string;
  label: string;
  icon?: React.ElementType;
  disabled: boolean;
  badge?: string;
  isSelected: boolean;
  onLabelPress: () => void;
}) {
  return (
    <Pressable
      className={`flex flex-col gap-2 bg-card rounded-lg p-4 flex-1 justify-start items-center border-2 ${
        isSelected ? "border-primary" : "border-transparent"
      } ${disabled ? "opacity-50" : ""}`}
      onPress={() => !disabled && onLabelPress()}
    >
      {icon &&
        React.createElement(icon, {
          "aria-labelledby": `label-for-${value}`,
          className: `w-10 h-10 ${
            isSelected ? "text-primary" : "text-muted-foreground"
          }`,
        })}
      <Label
        nativeID={`label-for-${value}`}
        className={`text-base text-white font-nunito-sans-bold text-center ${
          disabled ? "opacity-50" : ""
        }`}
        onPress={() => !disabled && onLabelPress()}
      >
        {label}
      </Label>
      {badge && (
        <Badge variant="secondary">
          <Text>{badge}</Text>
        </Badge>
      )}
    </Pressable>
  );
}

function RadioGroupItemTile({
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
      className={`flex flex-col gap-2 bg-card py-1 rounded-lg flex-1 justify-start items-center border-2 ${
        isSelected ? "border-primary" : "border-transparent"
      } ${disabled ? "opacity-50" : ""}`}
      onPress={() => !disabled && onLabelPress()}
    >
      <Label
        nativeID={`label-for-${value}`}
        className={`text-base text-white font-nunito-sans-bold text-center ${
          disabled ? "opacity-50" : ""
        }`}
        onPress={() => !disabled && onLabelPress()}
      >
        {label}
      </Label>
    </Pressable>
  );
}
