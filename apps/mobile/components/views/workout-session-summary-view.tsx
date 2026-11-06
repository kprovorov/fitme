import type { MuscleGroup } from "@fitme/core";
import { loggedExercises } from "@fitme/core";
import {
  formatCount,
  formatNumber,
  formatUnit,
  formatWorkoutDuration,
  spokenUnit,
} from "@fitme/i18n";
import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { useExercises } from "~/hooks/queries/library";
import type { WorkoutSession } from "~/hooks/queries/workout-sessions";
import { useI18n } from "~/lib/i18n";

import {
  WorkoutSessionSummaryBodyBack,
  WorkoutSessionSummaryBodyFront,
} from "./workout-session-summary-body";
import WorkoutSessionSummaryExerciseRow from "./workout-session-summary-exercise-row";
import WorkoutSessionSummaryStat from "./workout-session-summary-stat";

interface WorkoutSessionSummaryViewProps {
  onContinue: () => void;
  workoutSession: WorkoutSession;
}

const WorkoutSessionSummaryView = ({
  workoutSession,
  onContinue,
}: WorkoutSessionSummaryViewProps) => {
  const i18n = useI18n();
  const { t } = useTranslation();
  // Weights are in the session's own unit, the User's when it was read.
  const weightUnit = workoutSession.weight_unit;

  // Skipped exercises (no set logged) don't count toward the summary.
  const exercises = useMemo(
    () =>
      loggedExercises(workoutSession.exercises).toSorted(
        (a, b) => a.order - b.order
      ),
    [workoutSession.exercises]
  );

  const shownBySlug = useExercises(
    exercises.map(({ exercise_slug }) => exercise_slug)
  );

  const muscleGroups = new Set<MuscleGroup>(
    exercises.flatMap(
      ({ exercise_slug }) => shownBySlug[exercise_slug]?.muscle_groups ?? []
    )
  );

  const volume = exercises.reduce(
    (exerciseTotal, exercise) =>
      exerciseTotal +
      exercise.sets.reduce(
        (setTotal, set) =>
          setTotal + (set.weight_completed ?? 0) * (set.reps_completed ?? 0),
        0
      ),
    0
  );

  const setsLogged = exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.filter((set) => set.reps_completed !== null).length,
    0
  );

  return (
    <View className="gap-md flex w-full flex-col items-stretch justify-center">
      <Text className="text-center" variant="h2">
        {t("workoutSummary.title")}
      </Text>

      <View className="px-md flex flex-row items-start justify-between gap-4">
        <VStack className="items-start">
          <WorkoutSessionSummaryStat
            icon="clock"
            title={t("workoutSession.stats.duration")}
            value={
              workoutSession.finished_at
                ? formatWorkoutDuration(
                    i18n,
                    workoutSession.started_at,
                    workoutSession.finished_at
                  )
                : "—"
            }
          />
          <WorkoutSessionSummaryStat
            icon="scalemass.fill"
            spokenValue={spokenUnit(i18n, Math.round(volume), weightUnit)}
            title={t("workoutSession.stats.volume")}
            value={formatUnit(i18n, Math.round(volume), weightUnit)}
          />
          <WorkoutSessionSummaryStat
            icon="dumbbell.fill"
            spokenValue={formatCount(i18n, "exercises", exercises.length)}
            title={t("workoutSummary.stats.exercises")}
            value={formatNumber(i18n, exercises.length)}
          />
          <WorkoutSessionSummaryStat
            icon="bolt.fill"
            spokenValue={formatCount(i18n, "sets", setsLogged)}
            title={t("workoutSession.stats.sets")}
            value={formatNumber(i18n, setsLogged)}
          />
        </VStack>

        <View className="flex flex-row items-center justify-center gap-3">
          <WorkoutSessionSummaryBodyFront groups={muscleGroups} />
          <WorkoutSessionSummaryBodyBack groups={muscleGroups} />
        </View>
      </View>

      <Separator />

      <View className="gap-md flex w-full flex-col items-stretch justify-center">
        {exercises.map((exercise, index) => (
          <Fragment key={exercise.id}>
            {index > 0 && <Separator />}
            <WorkoutSessionSummaryExerciseRow
              exercise={shownBySlug[exercise.exercise_slug]}
              planId={workoutSession.plan?.id ?? null}
              sessionId={workoutSession.id}
              workoutId={workoutSession.workout?.id ?? null}
              workoutSessionExercise={exercise}
            />
          </Fragment>
        ))}
      </View>

      <Separator />

      <View className="px-md flex w-full flex-col items-center justify-center gap-4">
        <Button
          className="w-full"
          icon="arrow.right"
          iconPosition="trailing"
          label={t("workoutSummary.continue")}
          onPress={onContinue}
          size="lg"
        />
      </View>
    </View>
  );
};

export default WorkoutSessionSummaryView;
