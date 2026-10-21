import type { WorkoutSessionExercise } from "@fitme/core";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import ExerciseImage from "~/components/exercises/exercise-image";
import { SymbolImage } from "~/components/symbol-image";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";

interface WorkoutSessionSummaryExerciseRowProps {
  planId: string | null;
  sessionId: string;
  workoutId: string | null;
  workoutSessionExercise: WorkoutSessionExercise;
}

export default function WorkoutSessionSummaryExerciseRow({
  planId,
  workoutId,
  sessionId,
  workoutSessionExercise,
}: WorkoutSessionSummaryExerciseRowProps) {
  const router = useRouter();
  const { data: history } = useExerciseHistoryQuery({
    variables: { exerciseId: workoutSessionExercise.exercise_id },
  });

  const setsLogged = workoutSessionExercise.sets.filter(
    (set) => set.reps_completed !== null
  ).length;

  const sessionMaxWeight = Math.max(
    0,
    ...workoutSessionExercise.sets.map((set) => set.weight_completed ?? 0)
  );
  const priorMaxWeight = Math.max(
    0,
    ...(history ?? [])
      .filter((entry) => entry.workout_session_id !== sessionId)
      .flatMap((entry) => entry.sets.map((set) => set.weight_completed ?? 0))
  );
  const isNewRecord = sessionMaxWeight > 0 && sessionMaxWeight > priorMaxWeight;

  const handlePress = () => {
    if (!(planId && workoutId)) {
      return;
    }
    router.push(
      `/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${workoutSessionExercise.id}`
    );
  };

  return (
    <Pressable className="active:opacity-80" onPress={handlePress}>
      <HStack className="w-full items-center gap-2 px-md">
        <ExerciseImage exercise={workoutSessionExercise.exercise} size={32} />
        <Text className="text-body-emphasized text-primary">{setsLogged}</Text>
        <SymbolImage name="xmark" size={10} tintColor="#C0FF38" />
        <Text
          className="flex-1 text-body-emphasized text-foreground"
          numberOfLines={1}
        >
          {workoutSessionExercise.exercise.name}
        </Text>
        {isNewRecord ? (
          <SymbolImage name="trophy.fill" size={17} tintColor="#C0FF38" />
        ) : null}
        <SymbolImage name="chevron.right" size={17} tintColor="#FAFAFA" />
      </HStack>
    </Pressable>
  );
}
