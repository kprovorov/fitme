import type { MuscleGroup, WorkoutSession } from "@fitme/core";
import type { ExerciseSummary } from "@fitme/library-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Alert, Modal, ScrollView } from "react-native";
import { useExercises } from "~/hooks/queries/exercise-library";
import {
  useCreateWorkoutSessionExerciseMutation,
  useDeleteWorkoutSessionExerciseMutation,
  useReplaceWorkoutSessionExerciseMutation,
} from "~/hooks/queries/workout-session-exercises";
import { ApiError, rateLimitedFor } from "~/lib/api/client";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { Button } from "../ui/button";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";
import ExercisesView from "./exercises-view";
import WorkoutSessionExerciseCard from "./workout-session-exercise-card";

/** What to tell the User after a failed edit of the Workout Session's Exercises. */
const sessionEditFailureMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.code === "exercise_library_unavailable") {
      return "The exercise library is unavailable right now. Please try again.";
    }
    if (error.code === "session_finished") {
      return "This workout is already finished.";
    }
  }
  const waitSeconds = rateLimitedFor(error);
  return waitSeconds === null
    ? "Please check your connection and try again."
    : `Too many requests: please try again in ${waitSeconds} s.`;
};

interface WorkoutSessionViewProps {
  sessionId: string;
  workoutSession: WorkoutSession;
}

interface ExerciseCtaButtonProps {
  exercise: ExerciseSummary;
  label: string;
  onPress: (exercise: ExerciseSummary) => void;
}

function ExerciseCtaButton({
  exercise,
  label,
  onPress,
}: ExerciseCtaButtonProps) {
  const handlePress = useCallback(() => onPress(exercise), [exercise, onPress]);

  return <Button fill={false} label={label} onPress={handlePress} size="sm" />;
}

export default function WorkoutSessionView({
  workoutSession,
  sessionId,
}: WorkoutSessionViewProps) {
  const queryClient = useQueryClient();
  const shownBySlug = useExercises(
    workoutSession.exercises.map(({ exercise_slug }) => exercise_slug)
  );
  const [showModal, setShowModal] = useState(false);
  const [replacingExerciseId, setReplacingExerciseId] = useState<string | null>(
    null
  );
  const [initialMuscleGroup, setInitialMuscleGroup] = useState<
    MuscleGroup | undefined
  >(undefined);

  // A failed edit may still have been saved (a lost answer): read again
  // either way.
  const rereadSession = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["workout-session"],
    });
  }, [queryClient]);

  const { mutateAsync } = useCreateWorkoutSessionExerciseMutation({
    onSettled: rereadSession,
  });

  const { mutateAsync: deleteExercise } =
    useDeleteWorkoutSessionExerciseMutation({ onSettled: rereadSession });

  const { mutateAsync: replaceExercise } =
    useReplaceWorkoutSessionExerciseMutation({ onSettled: rereadSession });

  const onExercisePress = useCallback(
    async (exercise: ExerciseSummary) => {
      if (replacingExerciseId === null) {
        try {
          await mutateAsync({
            data: {
              exercise_slug: exercise.slug,
            },
            sessionId,
          });
        } catch (error) {
          // The picker stays open, so the User can try again.
          Alert.alert(
            "Couldn't add exercise",
            sessionEditFailureMessage(error)
          );
          return;
        }
        if (!IS_E2E) {
          segmentClient.track("Exercise Added", {
            exercise_slug: exercise.slug,
            session_id: sessionId,
          });
        }
      } else {
        try {
          await replaceExercise({
            data: {
              exercise_slug: exercise.slug,
            },
            exerciseId: replacingExerciseId,
          });
        } catch (error) {
          // The picker stays open, so the User can try again.
          Alert.alert(
            "Couldn't replace exercise",
            sessionEditFailureMessage(error)
          );
          return;
        }
        if (!IS_E2E) {
          segmentClient.track("Exercise Replaced", {
            exercise_slug: exercise.slug,
            session_id: sessionId,
          });
        }
        setReplacingExerciseId(null);
        setInitialMuscleGroup(undefined);
      }
      setShowModal(false);
    },
    [mutateAsync, replaceExercise, replacingExerciseId, sessionId]
  );

  const handleRequestClose = useCallback(() => {
    setShowModal(!showModal);
    setReplacingExerciseId(null);
    setInitialMuscleGroup(undefined);
  }, [showModal]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setReplacingExerciseId(null);
    setInitialMuscleGroup(undefined);
  }, []);

  const openModal = useCallback(() => setShowModal(true), []);

  const renderExerciseCta = useCallback(
    (exercise: ExerciseSummary) => (
      <ExerciseCtaButton
        exercise={exercise}
        label={replacingExerciseId === null ? "Add" : "Replace"}
        onPress={onExercisePress}
      />
    ),
    [onExercisePress, replacingExerciseId]
  );

  const handleDeleteExercise = async (exerciseId: string) => {
    try {
      await deleteExercise({
        exerciseId,
      });
    } catch (error) {
      Alert.alert("Couldn't delete exercise", sessionEditFailureMessage(error));
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
    setReplacingExerciseId(exerciseId);
    setInitialMuscleGroup(muscleGroup);
    setShowModal(true);
  };

  return (
    <>
      <Modal
        animationType="slide"
        backdropColorClassName="accent-background"
        onRequestClose={handleRequestClose}
        presentationStyle="pageSheet"
        visible={showModal}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          // A result is tapped with the search keyboard still up.
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <VStack className="flex-1 items-stretch bg-background p-md">
            <HStack className="justify-end">
              <Button
                accessibilityLabel="Close"
                icon="xmark"
                onPress={handleCloseModal}
                shape="circle"
                variant="ghost"
              />
            </HStack>
            <ExercisesView
              initialMuscleGroup={initialMuscleGroup}
              itemCta={renderExerciseCta}
            />
          </VStack>
        </ScrollView>
      </Modal>

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
            label="Add Exercise"
            onPress={openModal}
            variant="secondary"
          />
        )}
      </VStack>
    </>
  );
}
