import { zodResolver } from "@hookform/resolvers/zod";
import Slider from "@react-native-community/slider";
import { router, Stack } from "expo-router";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { z } from "zod";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import { H4, Muted } from "~/components/ui/typography";
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

      <SafeAreaView className="flex-1" edges={["top"]}>
        <KeyboardAwareScrollView
          bottomOffset={24}
          className="flex-1"
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
                <Text className="text-muted-foreground text-sm">
                  What is your goal?
                </Text>
              </VStack>

              <Controller
                control={form.control}
                name="goal"
                render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                  <RadioGroup
                    className="flex flex-row items-stretch justify-stretch gap-4"
                    onValueChange={onChange}
                    value={value}
                  >
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
                  </RadioGroup>
                )}
              />
              {form.formState.errors.goal && (
                <Text className="text-red-500">
                  {form.formState.errors.goal.message}
                </Text>
              )}

              <VStack className="items-start justify-start gap-0">
                <H4>Experience</H4>
                <Text className="text-muted-foreground text-sm">
                  How much experience do you have?
                </Text>
              </VStack>

              <Controller
                control={form.control}
                name="experience_level"
                render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                  <RadioGroup
                    className="flex flex-col items-stretch justify-stretch gap-4"
                    onValueChange={onChange}
                    value={value}
                  >
                    {experienceLevels.map((option) => (
                      <RadioGroupItemWithLabel
                        disabled={false}
                        disclaimer={getExperienceLevelDisclaimer(option)}
                        isSelected={option === value}
                        key={option}
                        label={getExperienceLevelLabel(option)}
                        onLabelPress={() => onChange(option)}
                        testID={`experience-${option}`}
                        value={option}
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

              <VStack className="items-stretch justify-start gap-0">
                <HStack className="items-center justify-between">
                  <H4>Workout duration</H4>
                  <Text className="text-primary text-sm">
                    {form.watch("workout_duration")} minutes
                  </Text>
                </HStack>
                <Text className="text-muted-foreground text-sm">
                  How long do you want to workout?
                </Text>
              </VStack>

              <Controller
                control={form.control}
                name="workout_duration"
                render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                  <Slider
                    maximumValue={120}
                    minimumTrackTintColor="#C0FF38"
                    minimumValue={30}
                    onValueChange={onChange}
                    step={10}
                    style={{ width: "100%", height: 40 }}
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
                <Text className="text-muted-foreground text-sm">
                  Choose where you want to do your workouts
                </Text>
              </VStack>

              <Controller
                control={form.control}
                name="place"
                render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                  <RadioGroup
                    className="flex flex-row items-stretch justify-stretch gap-4"
                    onValueChange={onChange}
                    value={value}
                  >
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
                  </RadioGroup>
                )}
              />
              {form.formState.errors.place && (
                <Text className="text-red-500">
                  {form.formState.errors.place.message}
                </Text>
              )}

              <VStack className="items-start justify-start gap-0">
                <H4>Frequency</H4>
                <Text className="text-muted-foreground text-sm">
                  How many times per week do you want to workout?
                </Text>
              </VStack>

              <Controller
                control={form.control}
                name="frequency"
                render={({ field: { onChange, onBlur: _onBlur, value } }) => (
                  <RadioGroup
                    className="flex flex-row items-stretch justify-stretch gap-4"
                    onValueChange={onChange}
                    value={value?.toString()}
                  >
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
                  </RadioGroup>
                )}
              />
              {form.formState.errors.frequency && (
                <Text className="text-red-500">
                  {form.formState.errors.frequency.message}
                </Text>
              )}

              <VStack className="items-start justify-start gap-0">
                <H4>Custom note</H4>
                <Text className="text-muted-foreground text-sm">
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
                  onPress={form.handleSubmit((values) => {
                    router.dismissAll();
                    router.navigate({
                      pathname: "/(tabs)/agent",
                      params: { planRequest: JSON.stringify(values) },
                    });
                  })}
                >
                  <Text>Get my plan!</Text>
                </Button>
              </VStack>
            </VStack>
          </VStack>
        </KeyboardAwareScrollView>
      </SafeAreaView>
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
      <RadioGroupItem
        aria-labelledby={`label-for-${value}`}
        disabled={disabled}
        value={value}
      />
      <HStack className="flex-1 items-center justify-between gap-0 p-0">
        <VStack className="flex-1 items-start gap-0 p-0">
          <Label
            className={`font-nunito-sans-bold text-base text-white ${
              disabled ? "opacity-50" : ""
            }`}
            nativeID={`label-for-${value}`}
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
        className={`text-center font-nunito-sans-bold text-base text-white ${
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
        className={`text-center font-nunito-sans-bold text-base text-white ${
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
