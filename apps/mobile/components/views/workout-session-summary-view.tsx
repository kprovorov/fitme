import type { MuscleGroup, WorkoutSession } from "@fitme/core";
import { formatWeight, formatWorkoutDuration } from "@fitme/core";
import { Fragment, useMemo } from "react";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { useProfileQuery } from "~/hooks/queries/profiles";
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
  const { data: profile } = useProfileQuery();
  const measurementSystem = profile?.measurement_system ?? "metric";

  const muscleGroups = useMemo(
    () =>
      new Set<MuscleGroup>(
        workoutSession.exercises.flatMap(
          (exercise) => exercise.exercise.muscle_groups
        )
      ),
    [workoutSession.exercises]
  );

  const volume = workoutSession.exercises.reduce(
    (exerciseTotal, exercise) =>
      exerciseTotal +
      exercise.sets.reduce(
        (setTotal, set) =>
          setTotal + (set.weight_completed ?? 0) * (set.reps_completed ?? 0),
        0
      ),
    0
  );

  const setsLogged = workoutSession.exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.filter((set) => set.reps_completed !== null).length,
    0
  );

  return (
    <VStack className="w-full items-stretch gap-md">
      <Text className="text-center font-nunito-sans-semibold text-primary text-title-1">
        Workout Complete!
      </Text>

      <HStack className="items-start justify-between px-md">
        <VStack className="items-start gap-4">
          <WorkoutSessionSummaryStat
            icon="clock"
            title="Duration"
            value={
              workoutSession.finished_at
                ? formatWorkoutDuration(
                    workoutSession.started_at,
                    workoutSession.finished_at
                  )
                : "—"
            }
          />
          <WorkoutSessionSummaryStat
            icon="scalemass.fill"
            title="Volume"
            value={formatWeight(Math.round(volume), measurementSystem)}
          />
          <WorkoutSessionSummaryStat
            icon="dumbbell.fill"
            title="Exercises"
            value={String(workoutSession.exercises.length)}
          />
          <WorkoutSessionSummaryStat
            icon="bolt.fill"
            title="Sets"
            value={String(setsLogged)}
          />
        </VStack>

        <HStack className="items-center gap-3">
          <WorkoutSessionSummaryBodyFront groups={muscleGroups} />
          <WorkoutSessionSummaryBodyBack groups={muscleGroups} />
        </HStack>
      </HStack>

      <Separator />

      <VStack className="w-full items-stretch gap-md">
        {workoutSession.exercises
          .sort((a, b) => a.order - b.order)
          .map((exercise, index) => (
            <Fragment key={exercise.id}>
              {index > 0 && <Separator />}
              <WorkoutSessionSummaryExerciseRow
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
          label="Continue"
          onPress={onContinue}
          shape="pill"
          systemImage="arrow.right"
        />
      </VStack>
    </VStack>
  );
}
