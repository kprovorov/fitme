import {
  experienceLevels,
  type Goal,
  goals,
  type Place,
  places,
} from "@fitme/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { router, Stack } from "expo-router";
import type { TFunction } from "i18next";
import { useCallback } from "react";
import {
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";
import { z } from "zod";
import { goalSymbol } from "~/components/plans/plan-symbols";
import { SymbolImage } from "~/components/symbol-image";
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
import { choiceLabels, useChoiceLabels } from "~/lib/choices";
import { numberInRange } from "~/lib/form-schemas";
import { i18n } from "~/lib/i18n";
import { cn } from "~/lib/utils";

// The message is sent to Arnold as the User's own text, so it's in the App
// language, as the User would write it; Arnold answers in it.
function buildPlanMessage(data: PlanFormValues, t: TFunction): string {
  const labels = choiceLabels(t);
  const lines = [
    t("planner.message.intro"),
    t("planner.message.goal", { goal: labels.goal(data.goal) }),
    t("planner.message.experience", {
      experience: labels.experienceLevel(data.experience_level),
    }),
    t("planner.message.duration", { count: data.workout_duration }),
    t("planner.message.place", { place: labels.place(data.place) }),
    t("planner.message.frequency", { count: data.frequency }),
  ];
  if (data.note) {
    lines.push(t("planner.message.note", { note: data.note }));
  }
  return lines.join("\n");
}

export type PlanFormValues = z.infer<typeof formSchema>;

// Read when the form validates, so the message is in the App language then.
const required = () => i18n.t("planner.required");

const formSchema = z.object({
  experience_level: z.enum(experienceLevels, { error: required }),
  frequency: numberInRange(1, 7, required),
  goal: z.enum(goals, { error: required }),
  note: z.string().optional(),
  place: z.enum(places, { error: required }),
  workout_duration: numberInRange(1, 120, required),
});

// The goals the planner offers, each with the planner's own short wording
// (`planner.goal.options`, by enum id).
const goalOptions = [
  "fat-loss",
  "muscle-gain",
  "general-health-fitness",
] as const satisfies readonly Goal[];

// Home workouts aren't planned yet.
const soonPlaces: readonly Place[] = ["home"];

const frequencyOptions = [1, 2, 3, 4, 5, 6, 7];

interface PlanFieldProps<TName extends keyof PlanFormValues> {
  field: ControllerRenderProps<PlanFormValues, TName>;
  fieldState: ControllerFieldState;
}

function GoalOptions({ field: { onChange, value } }: PlanFieldProps<"goal">) {
  const { t } = useTranslation();
  return (
    <View className="flex flex-row items-stretch justify-stretch gap-4">
      {goalOptions.map((option) => (
        <RadioGroupItemTileWithIcon
          disabled={false}
          icon={goalSymbol(option)}
          isSelected={option === value}
          key={option}
          label={t(`planner.goal.options.${option}`)}
          onSelect={onChange}
          value={option}
        />
      ))}
    </View>
  );
}

function ExperienceLevelOptions({
  field: { onChange, value },
}: PlanFieldProps<"experience_level">) {
  const labels = useChoiceLabels();
  return (
    <View className="flex flex-col items-stretch justify-stretch gap-4">
      {experienceLevels.map((option) => (
        <RadioGroupItemWithLabel
          disabled={false}
          disclaimer={labels.experienceLevelDescription(option)}
          isSelected={option === value}
          key={option}
          label={labels.experienceLevel(option)}
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

function PlaceOptions({ field: { onChange, value } }: PlanFieldProps<"place">) {
  const { t } = useTranslation();
  const labels = useChoiceLabels();
  return (
    <View className="flex flex-row items-stretch justify-stretch gap-4">
      {places.map((option) => {
        const soon = soonPlaces.includes(option);
        return (
          <RadioGroupItemWithLabel
            badge={soon ? t("planner.place.soon") : undefined}
            disabled={soon}
            isSelected={option === value}
            key={option}
            label={labels.place(option)}
            onSelect={onChange}
            value={option}
          />
        );
      })}
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

function NoteField({
  field: { onChange, value },
  fieldState: { error },
}: PlanFieldProps<"note">) {
  const { t } = useTranslation();
  return (
    <Textarea
      className="h-48"
      error={error?.message}
      onChangeText={onChange}
      placeholder={t("planner.note.placeholder")}
      value={value}
    />
  );
}

// Controller's render prop must be stable; the fields read their text through
// hooks, so each is a component behind one.
function renderGoalField(props: PlanFieldProps<"goal">) {
  return <GoalOptions {...props} />;
}

function renderExperienceLevelField(props: PlanFieldProps<"experience_level">) {
  return <ExperienceLevelOptions {...props} />;
}

function renderPlaceField(props: PlanFieldProps<"place">) {
  return <PlaceOptions {...props} />;
}

function renderNoteField(props: PlanFieldProps<"note">) {
  return <NoteField {...props} />;
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
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          title: t("planner.title"),
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
              <H4>{t("planner.goal.title")}</H4>
              <Text className="text-muted-foreground text-subhead">
                {t("planner.goal.question")}
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
              <H4>{t("planner.experience.title")}</H4>
              <Text className="text-muted-foreground text-subhead">
                {t("planner.experience.question")}
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
                <H4>{t("planner.duration.title")}</H4>
                <Text className="text-primary text-subhead">
                  {t("planner.duration.minutes", {
                    count: form.watch("workout_duration"),
                  })}
                </Text>
              </HStack>
              <Text className="text-muted-foreground text-subhead">
                {t("planner.duration.question")}
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
              <H4>{t("planner.place.title")}</H4>
              <Text className="text-muted-foreground text-subhead">
                {t("planner.place.question")}
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
              <H4>{t("planner.frequency.title")}</H4>
              <Text className="text-muted-foreground text-subhead">
                {t("planner.frequency.question")}
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
              <H4>{t("planner.note.title")}</H4>
              <Text className="text-muted-foreground text-subhead">
                {t("planner.note.question")}
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="note"
              render={renderNoteField}
            />

            <VStack className="items-stretch gap-2">
              <Button
                label={t("planner.submit")}
                onPress={form.handleSubmit((data) => {
                  router.dismissTo({
                    params: {
                      initialMessage: buildPlanMessage(data, t),
                    },
                    pathname: "/(tabs)/arnold",
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
      {/* The badge wraps under a label too long to share the line with it. */}
      <HStack className="flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-1 p-0">
        <VStack className="shrink items-start gap-0 p-0">
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
  icon?: SFSymbol;
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
      {icon ? (
        <SymbolImage
          className={cn(
            "text-title-2",
            isSelected ? "text-primary" : "text-muted-foreground"
          )}
          name={icon}
        />
      ) : null}
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
