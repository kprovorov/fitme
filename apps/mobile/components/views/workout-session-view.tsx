import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, View } from "react-native";

import { useExercises } from "~/hooks/queries/library";
import { useDeleteWorkoutSessionExerciseMutation } from "~/hooks/queries/workout-session-exercises";
import { WORKOUT_SESSION_QUERY_KEY } from "~/hooks/queries/workout-sessions";
import type { WorkoutSession } from "~/hooks/queries/workout-sessions";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { sessionEditFailureMessage } from "~/lib/session-edit-failure";

import { Button } from "../ui/button";
import WorkoutSessionExerciseCard from "./workout-session-exercise-card";

interface WorkoutSessionViewProps {
  sessionId: string;
  workoutSession: WorkoutSession;
}

interface ExercisePickerParams {
  muscleGroup?: string;
  replaceExerciseId: string;
  workoutSessionId: string;
}

const WorkoutSessionView = ({
  workoutSession,
  sessionId,
}: WorkoutSessionViewProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const shownBySlug = useExercises(
    workoutSession.exercises.map(({ exercise_slug }) => exercise_slug)
  );

  const router = useRouter();

  // A failed edit may still have been saved (a lost answer): read again
  // either way.
  const rereadSession = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: WORKOUT_SESSION_QUERY_KEY,
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
      void segmentClient.track("Exercise Deleted", {
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

    const params: ExercisePickerParams = {
      replaceExerciseId: exerciseId,
      workoutSessionId: sessionId,
    };

    if (muscleGroup) {
      params.muscleGroup = muscleGroup;
    }

    router.push({
      params: { ...params },
      pathname: "/workout-sessions/[workoutSessionId]/exercise-picker",
    });
  };

  return (
    <View className="gap-sm flex flex-col items-stretch justify-stretch">
      {workoutSession.exercises
        .toSorted((a, b) => a.order - b.order)
        .map((exercise) => (
          <WorkoutSessionExerciseCard
            exercise={shownBySlug[exercise.exercise_slug]}
            key={exercise.id}
            onDelete={
              workoutSession.finished_at
                ? undefined
                : () => {
                    void handleDeleteExercise(exercise.id);
                  }
            }
            onReplace={
              workoutSession.finished_at
                ? undefined
                : () => handleReplaceExercise(exercise.id)
            }
            planId={workoutSession.plan?.id ?? null}
            readOnly={!!workoutSession.finished_at}
            sessionId={workoutSession.id}
            weightUnit={workoutSession.weight_unit}
            workoutId={workoutSession.workout?.id ?? null}
            workoutSessionExercise={exercise}
          />
        ))}
      {!workoutSession.finished_at && (
        <Button
          icon="plus"
          label={t("workoutSession.addExercise")}
          onPress={openPicker}
          size="lg"
          variant="secondary"
        />
      )}
    </View>
  );
};

export default WorkoutSessionView;
