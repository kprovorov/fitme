import { formatCount } from "@fitme/i18n";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";

import ExerciseImage from "~/components/exercises/exercise-image";
import { SymbolImage } from "~/components/symbol-image";
import { Text } from "~/components/ui/text";
import { shownExercise } from "~/hooks/queries/library";
import type { ShownExercise } from "~/hooks/queries/library";
import type {
  WorkoutSessionExercise,
  WorkoutSessionHistory,
  WorkoutSessionHistoryEntry,
} from "~/hooks/queries/workout-sessions";
import { useI18n } from "~/lib/i18n";
import { spokenPersonalRecords } from "~/lib/personal-records";

interface WorkoutSessionSummaryExerciseRowProps {
  /** The Exercise as resolved by `useExercises`. */
  exercise: ShownExercise | undefined;
  /**
   * The Personal record the session earned for this Exercise, as History
   * read it, with the unit History's weights are in; `null` for none.
   */
  personalRecord: {
    record: WorkoutSessionHistoryEntry["personal_records"][number];
    weightUnit: WorkoutSessionHistory["weightUnit"];
  } | null;
  planId: string | null;
  sessionId: string;
  workoutId: string | null;
  workoutSessionExercise: WorkoutSessionExercise;
}

const WorkoutSessionSummaryExerciseRow = ({
  exercise: resolved,
  personalRecord,
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

  const setsLogged = workoutSessionExercise.sets.filter(
    (set) => set.reps_completed !== null
  ).length;

  // The Exercise's screen lives under the session's Plan and Workout: none
  // once either is gone.
  const canOpen = !!(planId && workoutId);

  const handlePress = () => {
    router.push(
      `/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${workoutSessionExercise.id}`
    );
  };

  const label = t("workoutSummary.exercise", {
    name: exercise.name,
    sets: formatCount(i18n, "sets", setsLogged),
  });

  return (
    <Pressable
      accessibilityLabel={
        // Read after the rest of the row, as History's row reads its records.
        personalRecord
          ? t("history.entryWithRecords", {
              entry: label,
              records: spokenPersonalRecords({
                exerciseName: () => exercise.name,
                i18n,
                records: [personalRecord.record],
                weightUnit: personalRecord.weightUnit,
              }),
            })
          : label
      }
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
      {personalRecord ? (
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
