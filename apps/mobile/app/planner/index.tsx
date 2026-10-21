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
import React, { useCallback } from "react";
import {
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { HStack } from "~/components/ui/hstack";
import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import { H4, Muted } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { numberInRange } from "~/lib/form-schemas";
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

// The enum messages are zod 3's defaults, which the screen showed until zod 4.
const formSchema = z.object({
  experience_level: z.enum(experienceLevels, { error: "Required" }),
  frequency: numberInRange(1, 7, "Required"),
  goal: z.enum(goals, { error: "Required" }),
  note: z.string().optional(),
  place: z.enum(places, { error: "Required" }),
  workout_duration: numberInRange(1, 120, "Required"),
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

const frequencyOptions = [1, 2, 3, 4, 5, 6, 7];

interface PlanFieldProps<TName extends keyof PlanFormValues> {
  field: ControllerRenderProps<PlanFormValues, TName>;
  fieldState: ControllerFieldState;
}

function renderGoalField({
  field: { onChange, value },
}: PlanFieldProps<"goal">) {
  return (
    <View className="flex flex-row items-stretch justify-stretch gap-4">
      {goalOptions.map((option) => (
        <RadioGroupItemTileWithIcon
          disabled={false}
          icon={option.icon}
          isSelected={option.value === value}
          key={option.value}
          label={option.label}
          onSelect={onChange}
          value={option.value}
        />
      ))}
    </View>
  );
}

function renderExperienceLevelField({
  field: { onChange, value },
}: PlanFieldProps<"experience_level">) {
  return (
    <View className="flex flex-col items-stretch justify-stretch gap-4">
      {experienceLevels.map((option) => (
        <RadioGroupItemWithLabel
          disabled={false}
          disclaimer={getExperienceLevelDisclaimer(option)}
          isSelected={option === value}
          key={option}
          label={getExperienceLevelLabel(option) ?? option}
          onSelect={onChange}
          testID={`experience-${option}`}
          value={option}
        />
      ))}
    </View>
  );
}

function renderWorkoutDurationField({
  field: { onChange, value },
}: PlanFieldProps<"workout_duration">) {
  return (
    <Slider
      max={120}
      min={30}
      onValueChange={onChange}
      step={10}
      value={value}
    />
  );
}

function renderPlaceField({
  field: { onChange, value },
}: PlanFieldProps<"place">) {
  return (
    <View className="flex flex-row items-stretch justify-stretch gap-4">
      {placeOptions.map((option) => (
        <RadioGroupItemWithLabel
          badge={option.badge}
          disabled={option.disabled ?? false}
          isSelected={option.value === value}
          key={option.value}
          label={option.label}
          onSelect={onChange}
          value={option.value}
        />
      ))}
    </View>
  );
}

function renderFrequencyField({
  field: { onChange, value },
}: PlanFieldProps<"frequency">) {
  return (
    <View className="flex flex-row items-stretch justify-stretch gap-4">
      {frequencyOptions.map((option) => (
        <RadioGroupItemTile
          disabled={false}
          isSelected={option?.toString() === value?.toString()}
          key={option}
          label={option?.toString()}
          onSelect={onChange}
          testID={`frequency-${option}`}
          value={option?.toString()}
        />
      ))}
    </View>
  );
}

function renderNoteField({
  field: { onChange, value },
  fieldState: { error },
}: PlanFieldProps<"note">) {
  return (
    <Textarea
      className="h-48"
      error={error?.message}
      onChangeText={onChange}
      placeholder="e.g. I want to pay more attention to my abs"
      value={value}
    />
  );
}

export default function PlannerScreen() {
  const form = useForm<PlanFormValues>({
    defaultValues: {
      place: "gym",
      workout_duration: 60,
    },
    resolver: zodResolver(formSchema),
  });

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
              render={renderGoalField}
            />
            {form.formState.errors.goal ? (
              <ErrorMessage>{form.formState.errors.goal.message}</ErrorMessage>
            ) : null}

            <VStack className="items-start justify-start gap-0">
              <H4>Experience</H4>
              <Text className="text-muted-foreground text-subhead">
                How much experience do you have?
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="experience_level"
              render={renderExperienceLevelField}
            />
            {form.formState.errors.experience_level ? (
              <ErrorMessage>
                {form.formState.errors.experience_level.message}
              </ErrorMessage>
            ) : null}

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
              render={renderWorkoutDurationField}
            />
            {form.formState.errors.workout_duration ? (
              <ErrorMessage>
                {form.formState.errors.workout_duration.message}
              </ErrorMessage>
            ) : null}

            <VStack className="items-start justify-start gap-0">
              <H4>Place</H4>
              <Text className="text-muted-foreground text-subhead">
                Choose where you want to do your workouts
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="place"
              render={renderPlaceField}
            />
            {form.formState.errors.place ? (
              <ErrorMessage>{form.formState.errors.place.message}</ErrorMessage>
            ) : null}

            <VStack className="items-start justify-start gap-0">
              <H4>Frequency</H4>
              <Text className="text-muted-foreground text-subhead">
                How many times per week do you want to workout?
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="frequency"
              render={renderFrequencyField}
            />
            {form.formState.errors.frequency ? (
              <ErrorMessage>
                {form.formState.errors.frequency.message}
              </ErrorMessage>
            ) : null}

            <VStack className="items-start justify-start gap-0">
              <H4>Custom note</H4>
              <Text className="text-muted-foreground text-subhead">
                Add a custom note to your plan
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="note"
              render={renderNoteField}
            />

            <VStack className="items-stretch gap-2">
              <Button
                label="Get my plan!"
                onPress={form.handleSubmit((data) => {
                  router.dismissTo({
                    params: { initialMessage: buildPlanMessage(data) },
                    pathname: "/(tabs)/coach",
                  });
                })}
              />
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
      {selected ? (
        <View className="aspect-square h-[10px] w-[10px] rounded-full bg-primary" />
      ) : null}
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
  onSelect,
  testID,
}: {
  value: string;
  label: string;
  disclaimer?: string;
  disabled: boolean;
  badge?: string;
  isSelected: boolean;
  onSelect: (value: string) => void;
  testID?: string;
}) {
  const handlePress = useCallback(() => {
    if (!disabled) {
      onSelect(value);
    }
  }, [disabled, onSelect, value]);

  return (
    <Pressable
      className={`flex flex-1 flex-row items-center justify-start gap-2 rounded-lg border-2 bg-card p-4 ${
        isSelected ? "border-primary" : "border-transparent"
      } ${disabled ? "opacity-50" : ""}`}
      onPress={handlePress}
      testID={testID}
    >
      <RadioDot disabled={disabled} selected={isSelected} />
      <HStack className="flex-1 items-center justify-between gap-0 p-0">
        <VStack className="flex-1 items-start gap-0 p-0">
          <Label
            disabled={disabled}
            nativeID={`label-for-${value}`}
            onPress={handlePress}
          >
            {label}
          </Label>
          {!!disclaimer && <Muted className="text-subhead">{disclaimer}</Muted>}
        </VStack>
        {badge ? (
          <Badge variant="secondary">
            <Text>{badge}</Text>
          </Badge>
        ) : null}
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
  onSelect,
}: {
  value: string;
  label: string;
  icon?: React.ElementType;
  disabled: boolean;
  badge?: string;
  isSelected: boolean;
  onSelect: (value: string) => void;
}) {
  const handlePress = useCallback(() => {
    if (!disabled) {
      onSelect(value);
    }
  }, [disabled, onSelect, value]);

  return (
    <Pressable
      className={`flex flex-1 flex-col items-center justify-start gap-2 rounded-lg border-2 bg-card p-4 ${
        isSelected ? "border-primary" : "border-transparent"
      } ${disabled ? "opacity-50" : ""}`}
      onPress={handlePress}
    >
      {icon
        ? React.createElement(icon, {
            "aria-labelledby": `label-for-${value}`,
            className: `w-10 h-10 ${
              isSelected ? "text-primary" : "text-muted-foreground"
            }`,
          })
        : null}
      <Label
        className="text-center"
        disabled={disabled}
        nativeID={`label-for-${value}`}
        onPress={handlePress}
      >
        {label}
      </Label>
      {badge ? (
        <Badge variant="secondary">
          <Text>{badge}</Text>
        </Badge>
      ) : null}
    </Pressable>
  );
}

function RadioGroupItemTile({
  value,
  label,
  disabled,
  isSelected,
  onSelect,
  testID,
}: {
  value: string;
  label: string;
  disabled: boolean;
  isSelected: boolean;
  onSelect: (value: string) => void;
  testID?: string;
}) {
  const handlePress = useCallback(() => {
    if (!disabled) {
      onSelect(value);
    }
  }, [disabled, onSelect, value]);

  return (
    <Pressable
      className={`flex flex-1 flex-col items-center justify-start gap-2 rounded-lg border-2 bg-card py-1 ${
        isSelected ? "border-primary" : "border-transparent"
      } ${disabled ? "opacity-50" : ""}`}
      onPress={handlePress}
      testID={testID}
    >
      <Label
        className="text-center"
        disabled={disabled}
        nativeID={`label-for-${value}`}
        onPress={handlePress}
      >
        {label}
      </Label>
    </Pressable>
  );
}
