import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

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
  workouts: WorkoutDay[];
}

const GOAL_LABELS: Record<WorkoutPlan["goal"], string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  strength: "Strength",
  endurance: "Endurance",
  general_fitness: "General Fitness",
};

function ExerciseRow({ exercise }: { exercise: WorkoutExercise }) {
  return (
    <View className="flex-row items-baseline justify-between border-border/15 border-b py-2">
      <Text className="flex-1 pr-3 text-foreground text-sm" numberOfLines={1}>
        {exercise.name}
      </Text>
      <Text className="font-ibm-plex-mono text-muted-foreground text-xs">
        {exercise.sets} × {exercise.reps}
        {exercise.restSeconds ? ` / ${exercise.restSeconds}s` : ""}
      </Text>
    </View>
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
    <View className={last ? "" : "mb-4"}>
      <Text className="mb-1.5 font-semibold text-foreground text-xs uppercase tracking-wider opacity-50">
        {workout.dayLabel}
      </Text>
      <Text className="mb-2 font-semibold text-foreground text-sm">
        {workout.name}
      </Text>
      {workout.exercises.map((ex) => (
        <ExerciseRow exercise={ex} key={ex.name} />
      ))}
    </View>
  );
}

export function WorkoutPlanCard({ plan }: { plan: WorkoutPlan }) {
  return (
    <Animated.View
      className="mt-1 overflow-hidden rounded-2xl border border-border/20 bg-secondary/60"
      entering={FadeIn.duration(300)}
      style={{ borderCurve: "continuous" }}
    >
      {/* Header */}
      <View className="border-border/20 border-b px-4 pt-4 pb-3">
        <Text className="mb-2 font-bold text-base text-foreground">
          {plan.name}
        </Text>
        <View className="mb-2 flex-row gap-2">
          <View className="self-start rounded-full bg-primary/20 px-2.5 py-0.5">
            <Text className="font-semibold text-primary text-xs">
              {GOAL_LABELS[plan.goal]}
            </Text>
          </View>
          <View className="self-start rounded-full bg-muted/60 px-2.5 py-0.5">
            <Text className="text-muted-foreground text-xs">
              {plan.frequencyPerWeek}× per week
            </Text>
          </View>
        </View>
        {plan.description ? (
          <Text className="text-muted-foreground text-sm leading-5">
            {plan.description}
          </Text>
        ) : null}
      </View>

      {/* Workouts */}
      <View className="px-4 pt-3 pb-4">
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
