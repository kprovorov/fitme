import type { WorkoutSession } from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useExercises } from "~/hooks/queries/library";
import { useDeleteWorkoutSessionExerciseMutation } from "~/hooks/queries/workout-session-exercises";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { sessionEditFailureMessage } from "~/lib/session-edit-failure";
import { Button } from "../ui/button";
import { VStack } from "../ui/vstack";
import WorkoutSessionExerciseCard from "./workout-session-exercise-card";

interface WorkoutSessionViewProps {
  sessionId: string;
  workoutSession: WorkoutSession;
}

export default function WorkoutSessionView({
  workoutSession,
  sessionId,
}: WorkoutSessionViewProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const shownBySlug = useExercises(
    workoutSession.exercises.map(({ exercise_slug }) => exercise_slug)
  );
  const router = useRouter();

  // A failed edit may still have been saved (a lost answer): read again
  // either way.
  const rereadSession = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["workout-session"],
    });
  }, [queryClient]);

  const { mutateAsync: deleteExercise } =
    useDeleteWorkoutSessionExerciseMutation({ onSettled: rereadSession });

  const openPicker = useCallback(() => {
    router.push({
      params: { workoutSessionId: sessionId },
      pathname: "/workout-sessions/[workoutSessionId]/exercise-picker",
    });
  }, [router, sessionId]);

  const handleDeleteExercise = async (exerciseId: string) => {
    try {
      await deleteExercise({
        exerciseId,
      });
    } catch (error) {
      Alert.alert(
        t("workoutSession.editFailed.deleteTitle"),
        sessionEditFailureMessage(t, error)
      );
      return;
    }
    if (!IS_E2E) {
      segmentClient.track("Exercise Deleted", {
        exercise_id: exerciseId,
        session_id: sessionId,
      });
    }
  };

  const handleReplaceExercise = (exerciseId: string) => {
    const exercise = workoutSession.exercises.find((e) => e.id === exerciseId);
    const muscleGroup = exercise
      ? shownBySlug[exercise.exercise_slug]?.muscle_groups[0]
      : undefined;
    router.push({
      params: {
        replaceExerciseId: exerciseId,
        workoutSessionId: sessionId,
        ...(muscleGroup ? { muscleGroup } : {}),
      },
      pathname: "/workout-sessions/[workoutSessionId]/exercise-picker",
    });
  };

  return (
    <VStack className="items-stretch justify-stretch gap-sm">
      {[...workoutSession.exercises]
        .sort((a, b) => a.order - b.order)
        .map((exercise) => (
          <WorkoutSessionExerciseCard
            exercise={shownBySlug[exercise.exercise_slug]}
            key={exercise.id}
            onDelete={
              workoutSession.finished_at
                ? undefined
                : () => handleDeleteExercise(exercise.id)
            }
            onReplace={
              workoutSession.finished_at
                ? undefined
                : () => handleReplaceExercise(exercise.id)
            }
            planId={workoutSession.plan_id}
            readOnly={!!workoutSession.finished_at}
            sessionId={workoutSession.id}
            workoutId={workoutSession.workout_id}
            workoutSessionExercise={exercise}
          />
        ))}
      {!workoutSession.finished_at && (
        <Button
          icon="plus"
          label={t("workoutSession.addExercise")}
          onPress={openPicker}
          variant="secondary"
        />
      )}
    </VStack>
  );
}
