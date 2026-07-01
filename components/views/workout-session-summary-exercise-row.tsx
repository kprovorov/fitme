import ExerciseImage from "~/components/exercises/exercise-image";
import { SymbolImage } from "~/components/symbol-image";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import type { WorkoutSessionExercise } from "~/lib/models";

interface WorkoutSessionSummaryExerciseRowProps {
  sessionId: string;
  workoutSessionExercise: WorkoutSessionExercise;
}

export default function WorkoutSessionSummaryExerciseRow({
  sessionId,
  workoutSessionExercise,
}: WorkoutSessionSummaryExerciseRowProps) {
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

  return (
    <HStack className="w-full gap-2 px-md">
      <ExerciseImage exercise={workoutSessionExercise.exercise} size={32} />
      <Text className="font-nunito-sans-bold text-body text-primary">
        {setsLogged}
      </Text>
      <SymbolImage name="xmark" size={10} tintColor="#C0FF38" />
      <Text
        className="flex-1 font-nunito-sans-bold text-body text-foreground"
        numberOfLines={1}
      >
        {workoutSessionExercise.exercise.name}
      </Text>
      {isNewRecord && (
        <SymbolImage name="trophy.fill" size={17} tintColor="#C0FF38" />
      )}
    </HStack>
  );
}
