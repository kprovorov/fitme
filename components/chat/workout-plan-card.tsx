import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SymbolImage } from "@/components/symbol-image";
import { Button } from "@/components/ui/button";
import { Text as UIText } from "@/components/ui/text";
import {
  useActivatePlanMutation,
  useStorePlanMutation,
} from "@/hooks/queries/plans";
import type {
  Exercise,
  ExperienceLevel,
  Goal,
  Place,
  PlanData,
} from "~/lib/models";

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

const GOAL_ICONS: Record<WorkoutPlan["goal"], string> = {
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

function PlanTag({ icon, label }: { icon: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-muted/40 px-3 py-1.5">
      <SymbolImage
        className="text-muted-foreground dark:text-muted-foreground"
        name={icon}
        size={12}
      />
      <Text className="text-muted-foreground text-xs">{label}</Text>
    </View>
  );
}

function ExerciseRow({ exercise }: { exercise: WorkoutExercise }) {
  return (
    <Pressable
      className="flex-row items-center border-border/15 border-b py-3 active:opacity-60"
      onPress={() => router.push(`/exercises/${exercise.exercise_id}`)}
    >
      <Text className="w-8 font-semibold text-primary text-sm">
        {exercise.sets}×
      </Text>
      <Text className="flex-1 text-foreground text-sm" numberOfLines={1}>
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
        <Text className="flex-1 pr-2 font-bold text-primary text-sm leading-tight">
          {workout.name}
        </Text>
        <View className="flex-row items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1">
          <SymbolImage
            className="text-foreground dark:text-foreground"
            name="bolt.fill"
            size={10}
          />
          <Text className="font-semibold text-foreground text-xs">
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
  const storePlan = useStorePlanMutation();
  const activatePlan = useActivatePlanMutation();

  const isSaving = storePlan.isPending || activatePlan.isPending;

  const hasInvalidExercises = plan.workouts
    .flatMap((w) => w.exercises)
    .some((e) => !e.exercise_id);

  const handleSave = async () => {
    const planData: PlanData = {
      description: plan.description,
      experience_level: (plan.experienceLevel ??
        "intermediate") as ExperienceLevel,
      frequency: plan.frequencyPerWeek,
      goal: GOAL_MAP[plan.goal],
      name: plan.name,
      place: (plan.place ?? "gym") as Place,
      workout_duration: plan.workoutDuration ?? 60,
      workouts: plan.workouts.map((day, dayIndex) => ({
        description: "",
        exercises: day.exercises.map((ex, exIndex) => ({
          exercise: { id: ex.exercise_id } as Exercise,
          exercise_id: ex.exercise_id,
          order: exIndex,
          sets: Array.from({ length: ex.sets }, (_, i) => ({
            order: i,
            reps_recommended: parseReps(ex.reps),
            rest_recommended: ex.restSeconds ?? 90,
            weight_recommended: 0,
          })),
        })),
        name: day.name,
        order: dayIndex,
      })),
    };

    const savedPlan = await storePlan.mutateAsync(planData);
    await activatePlan.mutateAsync({ id: savedPlan.id });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    setSaved(true);
  };

  const placeIcon = plan.place === "home" ? "house" : "building.2";
  const placeLabel = plan.place === "home" ? "Home" : "Gym";

  return (
    <Animated.View
      className="mt-1 overflow-hidden rounded-2xl border border-border/20 bg-secondary/60"
      entering={FadeIn.duration(300)}
      style={{ borderCurve: "continuous" }}
    >
      <View className="border-border/20 border-b px-4 pt-4 pb-3">
        <Text className="mb-3 font-bold text-foreground text-lg leading-tight">
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
          {plan.place && <PlanTag icon={placeIcon} label={placeLabel} />}
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
            <UIText className="text-destructive text-xs">
              Some exercises could not be matched to the library and cannot be
              saved. Try regenerating the plan.
            </UIText>
          </View>
        )}
        <Button
          disabled={isSaving || saved || hasInvalidExercises}
          onPress={handleSave}
          shape="pill"
        >
          {isSaving ? (
            <ActivityIndicator color="black" size="small" />
          ) : (
            <UIText>{saved ? "Plan Saved" : "Save Plan"}</UIText>
          )}
        </Button>
      </View>
    </Animated.View>
  );
}
