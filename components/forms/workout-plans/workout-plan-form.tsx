import React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, FieldErrors, useForm } from "react-hook-form";
import { Pressable, View } from "react-native";
import { Text } from "~/components/ui/text";
import { Button } from "~/components/ui/button";
import { VStack } from "~/components/ui/vstack";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { H4, Muted, P } from "~/components/ui/typography";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Badge } from "~/components/ui/badge";
import { Label } from "~/components/ui/label";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { HeartPulse } from "~/lib/icons/HeartPulse";
import { Flame } from "~/lib/icons/Flame";

interface WorkoutPlanFormProps {
  onSubmit: (values: z.infer<typeof formSchema>) => Promise<void>;
  errors?: FieldErrors<WorkoutPlanFormValues>;
}

export type WorkoutPlanFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  goal: z.enum(["lose_weight", "gain_muscle", "improve_health"]),
  place: z.enum(["gym", "home"]),
  frequency: z.coerce.number().min(1).max(7),
});

export default function WorkoutPlanForm({
  onSubmit,
  errors,
}: WorkoutPlanFormProps) {
  const form = useForm<WorkoutPlanFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      goal: undefined,
      place: undefined,
      frequency: undefined,
    },
    errors,
  });

  const goalOptions = [
    { label: "Lose weight", value: "lose_weight", icon: Flame },
    { label: "Gain muscle", value: "gain_muscle", icon: BicepsFlexed },
    { label: "Improve health", value: "improve_health", icon: HeartPulse },
  ];

  const placeOptions = [
    { label: "Gym", value: "gym" },
    { label: "Home", value: "home", disabled: true, badge: "Soon" },
  ];

  return (
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

      <Button
        disabled={form.formState.isSubmitting}
        onPress={form.handleSubmit(onSubmit)}
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
        <VStack className="gap-0">
          <P className="font-bold">
            Hold on... AI is working hard to create your plan!
          </P>
          <Muted>This may take a couple of minutes.</Muted>
        </VStack>
      )}
    </VStack>
  );
}

function RadioGroupItemWithLabel({
  value,
  label,
  disabled,
  badge,
  isSelected,
  onLabelPress,
}: {
  value: string;
  label: string;
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
      <Label
        nativeID={`label-for-${value}`}
        className={`text-base text-white font-nunito-sans-bold ${
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
