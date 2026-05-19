import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SymbolImage } from "@/components/symbol-image";
import { supabase } from "@/lib/supabase";

export interface WorkoutExercise {
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
  frequencyPerWeek: number;
  goal:
    | "weight_loss"
    | "muscle_gain"
    | "strength"
    | "endurance"
    | "general_fitness";
  name: string;
  place?: "gym" | "home";
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

async function navigateToExercise(name: string) {
  const { data } = await supabase
    .from("exercises")
    .select("id")
    .ilike("name", name)
    .limit(1);
  const id = data?.[0]?.id;
  if (id) {
    router.push(`/exercises/${id}`);
  }
}

function ExerciseRow({ exercise }: { exercise: WorkoutExercise }) {
  return (
    <Pressable
      className="flex-row items-center border-border/15 border-b py-3 active:opacity-60"
      onPress={() => navigateToExercise(exercise.name)}
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
        <ExerciseRow exercise={ex} key={ex.name} />
      ))}
    </View>
  );
}

export function WorkoutPlanCard({ plan }: { plan: WorkoutPlan }) {
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
    </Animated.View>
  );
}
