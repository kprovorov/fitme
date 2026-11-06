import { formatCount } from "@fitme/i18n";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";

import ExerciseImage from "~/components/exercises/exercise-image";
import { SymbolImage } from "~/components/symbol-image";
import { Text } from "~/components/ui/text";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { shownExercise } from "~/hooks/queries/library";
import type { ShownExercise } from "~/hooks/queries/library";
import type { WorkoutSessionExercise } from "~/hooks/queries/workout-sessions";
import { useI18n } from "~/lib/i18n";

interface WorkoutSessionSummaryExerciseRowProps {
  /** The Exercise as resolved by `useExercises`. */
  exercise: ShownExercise | undefined;
  planId: string | null;
  sessionId: string;
  workoutId: string | null;
  workoutSessionExercise: WorkoutSessionExercise;
}

const WorkoutSessionSummaryExerciseRow = ({
  exercise: resolved,
  planId,
  workoutId,
  sessionId,
  workoutSessionExercise,
}: WorkoutSessionSummaryExerciseRowProps) => {
  const router = useRouter();
  const i18n = useI18n();
  const { t } = useTranslation();

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

  // The best before this session, over the history pages read so far: the
  // first page is 20 Workout Sessions, so an Exercise with a longer history
  // is compared against its most recent ones (the record itself is the
  // server's, and lands on an entry later).
  let priorMaxWeight = 0;

  for (const page of history?.pages ?? []) {
    for (const entry of page.data) {
      if (entry.session.id !== sessionId) {
        for (const set of entry.sets) {
          priorMaxWeight = Math.max(priorMaxWeight, set.weight_completed ?? 0);
        }
      }
    }
  }

  const isNewRecord = sessionMaxWeight > 0 && sessionMaxWeight > priorMaxWeight;

  // The Exercise's screen lives under the session's Plan and Workout: none
  // once either is gone.
  const canOpen = !!(planId && workoutId);

  const handlePress = () => {
    router.push(
      `/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${workoutSessionExercise.id}`
    );
  };

  return (
    <Pressable
      accessibilityLabel={t("workoutSummary.exercise", {
        name: exercise.name,
        sets: formatCount(i18n, "sets", setsLogged),
      })}
      accessibilityRole={canOpen ? "button" : undefined}
      className="px-md flex w-full flex-row items-center justify-center gap-2 active:opacity-80"
      disabled={!canOpen}
      onPress={handlePress}
    >
      <ExerciseImage exercise={exercise} size={32} />
      <Text className="text-primary" variant="large">
        {setsLogged}
      </Text>
      <SymbolImage
        className="text-caption-1-emphasized text-primary"
        name="xmark"
      />
      <Text className="flex-1" numberOfLines={1} variant="large">
        {exercise.name}
      </Text>
      {isNewRecord ? (
        <SymbolImage
          className="text-body-emphasized text-primary"
          name="trophy.fill"
        />
      ) : null}
      {canOpen ? (
        <SymbolImage
          className="text-body-emphasized text-foreground"
          name="chevron.right"
        />
      ) : null}
    </Pressable>
  );
};

export default WorkoutSessionSummaryExerciseRow;
