import React from "react";
import { H2, H4, Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { Text } from "~/components/ui/text";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useIsProQuery } from "~/hooks/revenueCat";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { Button } from "~/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { HeartPulse } from "~/lib/icons/HeartPulse";
import { Flame } from "~/lib/icons/Flame";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { useStorePlanMutation } from "~/hooks/queries/plans";
import { experienceLevels, goals, places } from "~/lib/models";
import {
  getExperienceLevelDisclaimer,
  getExperienceLevelLabel,
} from "~/lib/labels";
import { HStack } from "~/components/ui/hstack";
import Slider from "@react-native-community/slider";

export type PlanFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  goal: z.enum(goals),
  place: z.enum(places),
  frequency: z.coerce.number().min(1).max(7),
  experience_level: z.enum(experienceLevels),
  workout_duration: z.coerce.number().min(1).max(120),
});

export default function PlanScreen() {
  const queryClient = useQueryClient();

  const { mutateAsync: storePlan } = useStorePlanMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      router.dismissTo("/");
    },
  });

  const { data: isPro } = useIsProQuery();

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

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1">
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <VStack className="h-full p-6 items-center justify-center gap-4">
            <VStack className="gap-2">
              <H2 className="text-center">Create workout plan</H2>
            </VStack>
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
                    minimumTrackTintColor="#FFFFFF"
                    maximumTrackTintColor="#000000"
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
            </VStack>
          </VStack>
        </ScrollView>
        <VStack className="p-6 items-stretch gap-2">
          <Button
            disabled={form.formState.isSubmitting}
            onPress={form.handleSubmit(async (values) => {
              if (isPro) {
                await storePlan(values);
              } else {
                const result = await RevenueCatUI.presentPaywall();
                if (
                  [PAYWALL_RESULT.PURCHASED, PAYWALL_RESULT.RESTORED].includes(
                    result
                  )
                ) {
                  await storePlan(values);
                }
              }
            })}
          >
            {form.formState.isSubmitting ? (
              <View className="animate-spin">
                <LoaderCircle size={16} className="text-black" />
              </View>
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
      </SafeAreaView>
    </SafeAreaProvider>
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
