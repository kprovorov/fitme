import type { MuscleGroup, WorkoutSession } from "@fitme/core";
import { loggedExercises } from "@fitme/core";
import {
  formatCount,
  formatNumber,
  formatWeight,
  formatWorkoutDuration,
} from "@fitme/i18n";
import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { useExercises } from "~/hooks/queries/library";
import { useProfileQuery } from "~/hooks/queries/profiles";
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

export default function WorkoutSessionSummaryView({
  workoutSession,
  onContinue,
}: WorkoutSessionSummaryViewProps) {
  const i18n = useI18n();
  const { t } = useTranslation();
  const { data: profile } = useProfileQuery();
  const measurementSystem = profile?.measurement_system ?? "metric";

  // Skipped exercises (no set logged) don't count toward the summary.
  const exercises = useMemo(
    () =>
      loggedExercises(workoutSession.exercises).sort(
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
    <VStack className="w-full items-stretch gap-md">
      <Text className="text-center text-primary text-title-1-emphasized">
        {t("workoutSummary.title")}
      </Text>

      <HStack className="items-start justify-between px-md">
        <VStack className="items-start gap-4">
          <WorkoutSessionSummaryStat
            icon="clock"
            title={t("workoutSummary.stats.duration")}
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
            title={t("workoutSummary.stats.volume")}
            value={formatWeight(i18n, Math.round(volume), measurementSystem)}
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
            title={t("workoutSummary.stats.sets")}
            value={formatNumber(i18n, setsLogged)}
          />
        </VStack>

        <HStack className="items-center gap-3">
          <WorkoutSessionSummaryBodyFront groups={muscleGroups} />
          <WorkoutSessionSummaryBodyBack groups={muscleGroups} />
        </HStack>
      </HStack>

      <Separator />

      <VStack className="w-full items-stretch gap-md">
        {exercises.map((exercise, index) => (
          <Fragment key={exercise.id}>
            {index > 0 && <Separator />}
            <WorkoutSessionSummaryExerciseRow
              exercise={shownBySlug[exercise.exercise_slug]}
              planId={workoutSession.plan_id}
              sessionId={workoutSession.id}
              workoutId={workoutSession.workout_id}
              workoutSessionExercise={exercise}
            />
          </Fragment>
        ))}
      </VStack>

      <Separator />

      <VStack className="w-full px-md">
        <Button
          className="w-full"
          icon="arrow.right"
          iconPosition="trailing"
          label={t("workoutSummary.continue")}
          onPress={onContinue}
        />
      </VStack>
    </VStack>
  );
}
