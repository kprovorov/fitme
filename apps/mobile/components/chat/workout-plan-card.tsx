import type { ExperienceLevel, Goal, Place, PlanInput } from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { SFSymbol } from "sf-symbols-typescript";
import { SymbolImage } from "@/components/symbol-image";
import { Button } from "@/components/ui/button";
import { Text as UIText } from "@/components/ui/text";
import {
  useActivatePlanMutation,
  useStorePlanMutation,
} from "@/hooks/queries/plans";

export interface WorkoutExercise {
  exercise_id: string;
  name: string;
  notes?: string;
  reps: string;
  restSeconds?: number;
  sets: number;
}

export interface WorkoutDay {
  dayLabel: string;
  exercises: WorkoutExercise[];
  name: string;
}

export interface WorkoutPlan {
  description: string;
  experienceLevel?: "beginner" | "intermediate" | "advanced";
  frequencyPerWeek: number;
  goal:
    | "weight_loss"
    | "muscle_gain"
    | "strength"
    | "endurance"
    | "general_fitness";
  name: string;
  place?: "gym" | "home";
  workoutDuration?: number;
  workouts: WorkoutDay[];
}

const GOAL_LABELS: Record<WorkoutPlan["goal"], string> = {
  endurance: "Endurance",
  general_fitness: "General Fitness",
  muscle_gain: "Gain Muscle",
  strength: "Strength",
  weight_loss: "Weight Loss",
};

const GOAL_ICONS: Record<WorkoutPlan["goal"], SFSymbol> = {
  endurance: "heart",
  general_fitness: "figure.walk",
  muscle_gain: "dumbbell",
  strength: "figure.strengthtraining.traditional",
  weight_loss: "figure.run",
};

const GOAL_MAP: Record<WorkoutPlan["goal"], Goal> = {
  endurance: "general-health-fitness",
  general_fitness: "general-health-fitness",
  muscle_gain: "muscle-gain",
  strength: "strength-performance",
  weight_loss: "fat-loss",
};

const REPS_RE = /^\d+/;

function parseReps(reps: string): number {
  const match = reps.match(REPS_RE);
  return match ? Number.parseInt(match[0], 10) : 10;
}

function PlanTag({ icon, label }: { icon: SFSymbol; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-muted/40 px-3 py-1.5">
      <SymbolImage
        className="text-muted-foreground dark:text-muted-foreground"
        name={icon}
        size={12}
      />
      <Text className="text-footnote text-muted-foreground">{label}</Text>
    </View>
  );
}

function ExerciseRow({ exercise }: { exercise: WorkoutExercise }) {
  const handlePress = useCallback(
    () => router.push(`/exercises/${exercise.exercise_id}`),
    [exercise.exercise_id]
  );

  return (
    <Pressable
      className="flex-row items-center border-border/15 border-b py-3 active:opacity-60"
      onPress={handlePress}
    >
      <Text className="w-8 text-primary text-subhead-emphasized">
        {exercise.sets}×
      </Text>
      <Text className="flex-1 text-foreground text-subhead" numberOfLines={1}>
        {exercise.name}
      </Text>
      <SymbolImage
        className="text-muted-foreground dark:text-muted-foreground"
        name="chevron.right"
        size={14}
      />
    </Pressable>
  );
}

function WorkoutDaySection({
  workout,
  last,
}: {
  workout: WorkoutDay;
  last: boolean;
}) {
  return (
    <View className={last ? "" : "mb-6"}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-primary text-subhead-emphasized">
          {workout.name}
        </Text>
        <View className="flex-row items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1">
          <SymbolImage
            className="text-foreground dark:text-foreground"
            name="bolt.fill"
            size={10}
          />
          <Text className="text-footnote-emphasized text-foreground">
            {workout.exercises.length}
          </Text>
        </View>
      </View>
      <View className="mb-1 border-border/20 border-b" />
      {workout.exercises.map((ex) => (
        <ExerciseRow exercise={ex} key={ex.exercise_id} />
      ))}
    </View>
  );
}

export function WorkoutPlanCard({ plan }: { plan: WorkoutPlan }) {
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();
  const { mutateAsync: storePlan, isPending: isStoring } =
    useStorePlanMutation();
  const { mutateAsync: activatePlan, isPending: isActivating } =
    useActivatePlanMutation();

  const isSaving = isStoring || isActivating;

  const hasInvalidExercises = plan.workouts
    .flatMap((w) => w.exercises)
    .some((e) => !e.exercise_id);

  const handleSave = useCallback(async () => {
    const planData: PlanInput = {
      description: plan.description,
      experience_level: (plan.experienceLevel ??
        "intermediate") as ExperienceLevel,
      frequency: plan.frequencyPerWeek,
      goal: GOAL_MAP[plan.goal],
      name: plan.name,
      place: (plan.place ?? "gym") as Place,
      workout_duration: plan.workoutDuration ?? 60,
      workouts: plan.workouts.map((day) => ({
        description: "",
        exercises: day.exercises.map((ex) => ({
          exercise_id: ex.exercise_id,
          sets: Array.from({ length: ex.sets }, () => ({
            reps_recommended: parseReps(ex.reps),
            rest_recommended: ex.restSeconds ?? 90,
            weight_recommended: 0,
          })),
        })),
        name: day.name,
      })),
    };

    const savedPlan = await storePlan(planData);
    await activatePlan({ id: savedPlan.id });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    setSaved(true);
  }, [activatePlan, plan, queryClient, storePlan]);

  const placeIcon: SFSymbol = plan.place === "home" ? "house" : "building.2";
  const placeLabel = plan.place === "home" ? "Home" : "Gym";

  return (
    <Animated.View
      className="mt-1 overflow-hidden rounded-2xl border border-border/20 bg-secondary/60"
      entering={FadeIn.duration(300)}
      style={{ borderCurve: "continuous" }}
    >
      <View className="border-border/20 border-b px-4 pt-4 pb-3">
        <Text className="mb-3 text-foreground text-title-3-emphasized">
          {plan.name}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <PlanTag
            icon={GOAL_ICONS[plan.goal]}
            label={GOAL_LABELS[plan.goal]}
          />
          <PlanTag
            icon="bolt.fill"
            label={`${plan.frequencyPerWeek}x / week`}
          />
          {plan.place ? <PlanTag icon={placeIcon} label={placeLabel} /> : null}
        </View>
      </View>

      <View className="px-4 pt-4 pb-4">
        {plan.workouts.map((workout, i) => (
          <WorkoutDaySection
            key={workout.dayLabel}
            last={i === plan.workouts.length - 1}
            workout={workout}
          />
        ))}
      </View>

      <View className="border-border/20 border-t px-4 pt-3 pb-4">
        {hasInvalidExercises && (
          <View className="mb-3 rounded-xl bg-destructive/10 px-3 py-2.5">
            <UIText className="text-destructive text-footnote">
              Some exercises could not be matched to the library and cannot be
              saved. Try regenerating the plan.
            </UIText>
          </View>
        )}
        <Button
          disabled={saved || hasInvalidExercises}
          isLoading={isSaving}
          label={saved ? "Plan Saved" : "Save Plan"}
          onPress={handleSave}
        />
      </View>
    </Animated.View>
  );
}
