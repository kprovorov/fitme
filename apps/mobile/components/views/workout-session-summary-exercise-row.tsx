import type { WorkoutSessionExercise } from "@fitme/core";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import ExerciseImage from "~/components/exercises/exercise-image";
import { SymbolImage } from "~/components/symbol-image";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import {
  type ShownExercise,
  shownExercise,
} from "~/hooks/queries/exercise-library";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";

interface WorkoutSessionSummaryExerciseRowProps {
  /** The Exercise as resolved by `useExercises`. */
  exercise: ShownExercise | undefined;
  planId: string | null;
  sessionId: string;
  workoutId: string | null;
  workoutSessionExercise: WorkoutSessionExercise;
}

export default function WorkoutSessionSummaryExerciseRow({
  exercise: resolved,
  planId,
  workoutId,
  sessionId,
  workoutSessionExercise,
}: WorkoutSessionSummaryExerciseRowProps) {
  const router = useRouter();
  const exercise =
    resolved ?? shownExercise(workoutSessionExercise.exercise_slug, null);
  const { data: history } = useExerciseHistoryQuery({
    variables: { exerciseSlug: workoutSessionExercise.exercise_slug },
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
        <ExerciseImage exercise={exercise} size={32} />
        <Text className="text-body-emphasized text-primary">{setsLogged}</Text>
        <SymbolImage
          className="text-caption-1-emphasized text-primary"
          name="xmark"
        />
        <Text
          className="flex-1 text-body-emphasized text-foreground"
          numberOfLines={1}
        >
          {exercise.name}
        </Text>
        {isNewRecord ? (
          <SymbolImage
            className="text-body-emphasized text-primary"
            name="trophy.fill"
          />
        ) : null}
        <SymbolImage
          className="text-body-emphasized text-foreground"
          name="chevron.right"
        />
      </HStack>
    </Pressable>
  );
}
