import {
  experienceLevels,
  getExperienceLevelDisclaimer,
  getExperienceLevelLabel,
  getGoalLabel,
  getPlaceLabel,
  goals,
  places,
} from "@fitme/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { router, Stack } from "expo-router";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import { H4, Muted } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { Flame } from "~/lib/icons/Flame";
import { HeartPulse } from "~/lib/icons/HeartPulse";
import { cn } from "~/lib/utils";

function buildPlanMessage(data: PlanFormValues): string {
  const lines = [
    "Please create a workout plan for me with the following details:",
    `- Goal: ${getGoalLabel(data.goal)}`,
    `- Experience: ${getExperienceLevelLabel(data.experience_level)}`,
    `- Workout duration: ${data.workout_duration} minutes`,
    `- Place: ${getPlaceLabel(data.place)}`,
    `- Frequency: ${data.frequency} ${data.frequency === 1 ? "day" : "days"} per week`,
  ];
  if (data.note) {
    lines.push(`- Additional notes: ${data.note}`);
  }
  return lines.join("\n");
}

export type PlanFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  experience_level: z.enum(experienceLevels),
  frequency: z.coerce.number().min(1).max(7),
  goal: z.enum(goals),
  note: z.string().optional(),
  place: z.enum(places),
  workout_duration: z.coerce.number().min(1).max(120),
});

export default function PlannerScreen() {
  const form = useForm<PlanFormValues>({
    defaultValues: {
      place: "gym",
      workout_duration: 60,
    },
    resolver: zodResolver(formSchema),
  });

  const goalOptions = [
    { icon: Flame, label: "Lose weight", value: "fat-loss" },
    { icon: BicepsFlexed, label: "Gain muscle", value: "muscle-gain" },
    {
      icon: HeartPulse,
      label: "Improve health",
      value: "general-health-fitness",
    },
  ];

  const placeOptions = [
    { label: "Gym", value: "gym" },
    { badge: "Soon", disabled: true, label: "Home", value: "home" },
  ];

  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen
        options={{
          title: "Create Workout Plan",
        }}
      />

      <KeyboardAwareScrollView
        bottomOffset={24}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <VStack
          className="items-center justify-center gap-4 p-md"
          style={{ paddingBottom: insets.bottom }}
        >
          <VStack className="w-full items-stretch">
            <VStack className="items-start justify-start gap-0">
              <H4>Goal</H4>
              <Text className="text-muted-foreground text-subhead">
                What is your goal?
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="goal"
              render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                <View className="flex flex-row items-stretch justify-stretch gap-4">
                  {goalOptions.map((option) => (
                    <RadioGroupItemTileWithIcon
                      disabled={false}
                      icon={option.icon}
                      isSelected={option.value === value}
                      key={option.value}
                      label={option.label}
                      onLabelPress={() => onChange(option.value)}
                      value={option.value}
                    />
                  ))}
                </View>
              )}
            />
            {form.formState.errors.goal && (
              <Text className="text-red-500">
                {form.formState.errors.goal.message}
              </Text>
            )}

            <VStack className="items-start justify-start gap-0">
              <H4>Experience</H4>
              <Text className="text-muted-foreground text-subhead">
                How much experience do you have?
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="experience_level"
              render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                <View className="flex flex-col items-stretch justify-stretch gap-4">
                  {experienceLevels.map((option) => (
                    <RadioGroupItemWithLabel
                      disabled={false}
                      disclaimer={getExperienceLevelDisclaimer(option)}
                      isSelected={option === value}
                      key={option}
                      label={getExperienceLevelLabel(option) ?? option}
                      onLabelPress={() => onChange(option)}
                      testID={`experience-${option}`}
                      value={option}
                    />
                  ))}
                </View>
              )}
            />
            {form.formState.errors.experience_level && (
              <Text className="text-red-500">
                {form.formState.errors.experience_level.message}
              </Text>
            )}

            <VStack className="items-stretch justify-start gap-0">
              <HStack className="items-center justify-between">
                <H4>Workout duration</H4>
                <Text className="text-primary text-subhead">
                  {form.watch("workout_duration")} minutes
                </Text>
              </HStack>
              <Text className="text-muted-foreground text-subhead">
                How long do you want to workout?
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="workout_duration"
              render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                <Slider
                  max={120}
                  min={30}
                  onValueChange={onChange}
                  step={10}
                  value={value}
                />
              )}
            />
            {form.formState.errors.workout_duration && (
              <Text className="text-red-500">
                {form.formState.errors.workout_duration.message}
              </Text>
            )}

            <VStack className="items-start justify-start gap-0">
              <H4>Place</H4>
              <Text className="text-muted-foreground text-subhead">
                Choose where you want to do your workouts
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="place"
              render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                <View className="flex flex-row items-stretch justify-stretch gap-4">
                  {placeOptions.map((option) => (
                    <RadioGroupItemWithLabel
                      badge={option.badge}
                      disabled={option.disabled ?? false}
                      isSelected={option.value === value}
                      key={option.value}
                      label={option.label}
                      onLabelPress={() => onChange(option.value)}
                      value={option.value}
                    />
                  ))}
                </View>
              )}
            />
            {form.formState.errors.place && (
              <Text className="text-red-500">
                {form.formState.errors.place.message}
              </Text>
            )}

            <VStack className="items-start justify-start gap-0">
              <H4>Frequency</H4>
              <Text className="text-muted-foreground text-subhead">
                How many times per week do you want to workout?
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="frequency"
              render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                <View className="flex flex-row items-stretch justify-stretch gap-4">
                  {[1, 2, 3, 4, 5, 6, 7].map((option) => (
                    <RadioGroupItemTile
                      disabled={false}
                      isSelected={option?.toString() === value?.toString()}
                      key={option}
                      label={option?.toString()}
                      onLabelPress={() => onChange(option?.toString())}
                      testID={`frequency-${option}`}
                      value={option?.toString()}
                    />
                  ))}
                </View>
              )}
            />
            {form.formState.errors.frequency && (
              <Text className="text-red-500">
                {form.formState.errors.frequency.message}
              </Text>
            )}

            <VStack className="items-start justify-start gap-0">
              <H4>Custom note</H4>
              <Text className="text-muted-foreground text-subhead">
                Add a custom note to your plan
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="note"
              render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                <Textarea
                  className="h-48"
                  onChangeText={onChange}
                  placeholder="e.g. I want to pay more attention to my abs"
                  value={value}
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
                onPress={form.handleSubmit((data) => {
                  router.dismissTo({
                    params: { initialMessage: buildPlanMessage(data) },
                    pathname: "/(tabs)/coach",
                  });
                })}
              >
                <Text>Get my plan!</Text>
              </Button>
            </VStack>
          </VStack>
        </VStack>
      </KeyboardAwareScrollView>
    </>
  );
}

/**
 * The planner's option tiles are a bespoke layout (icons, badges, disclaimers)
 * that SwiftUI's `Picker` can't express, so they keep a hand-drawn indicator
 * instead of using the shared SwiftUI `RadioGroup`.
 */
function RadioDot({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}) {
  return (
    <View
      className={cn(
        "aspect-square h-5 w-5 items-center justify-center rounded-full border-2 border-primary",
        disabled && "border-muted"
      )}
    >
      {selected && (
        <View className="aspect-square h-[10px] w-[10px] rounded-full bg-primary" />
      )}
    </View>
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
  testID,
}: {
  value: string;
  label: string;
  disclaimer?: string;
  disabled: boolean;
  badge?: string;
  isSelected: boolean;
  onLabelPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      className={`flex flex-1 flex-row items-center justify-start gap-2 rounded-lg border-2 bg-card p-4 ${
        isSelected ? "border-primary" : "border-transparent"
      } ${disabled ? "opacity-50" : ""}`}
      onPress={() => !disabled && onLabelPress()}
      testID={testID}
    >
      <RadioDot disabled={disabled} selected={isSelected} />
      <HStack className="flex-1 items-center justify-between gap-0 p-0">
        <VStack className="flex-1 items-start gap-0 p-0">
          <Label
            className={`font-nunito-sans-bold text-body text-white ${
              disabled ? "opacity-50" : ""
            }`}
            nativeID={`label-for-${value}`}
            onPress={() => !disabled && onLabelPress()}
          >
            {label}
          </Label>
          {!!disclaimer && <Muted className="text-subhead">{disclaimer}</Muted>}
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
      className={`flex flex-1 flex-col items-center justify-start gap-2 rounded-lg border-2 bg-card p-4 ${
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
        className={`text-center font-nunito-sans-bold text-body text-white ${
          disabled ? "opacity-50" : ""
        }`}
        nativeID={`label-for-${value}`}
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
  testID,
}: {
  value: string;
  label: string;
  disabled: boolean;
  isSelected: boolean;
  onLabelPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      className={`flex flex-1 flex-col items-center justify-start gap-2 rounded-lg border-2 bg-card py-1 ${
        isSelected ? "border-primary" : "border-transparent"
      } ${disabled ? "opacity-50" : ""}`}
      onPress={() => !disabled && onLabelPress()}
      testID={testID}
    >
      <Label
        className={`text-center font-nunito-sans-bold text-body text-white ${
          disabled ? "opacity-50" : ""
        }`}
        nativeID={`label-for-${value}`}
        onPress={() => !disabled && onLabelPress()}
      >
        {label}
      </Label>
    </Pressable>
  );
}
