import type { Exercise, WorkoutSession } from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Modal, ScrollView } from "react-native";
import {
  useCreateWorkoutSessionExerciseMutation,
  useDeleteWorkoutSessionExerciseMutation,
  useReplaceWorkoutSessionExerciseMutation,
} from "~/hooks/queries/workout-session-exercises";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { Button } from "../ui/button";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";
import ExercisesView from "./exercises-view";
import WorkoutSessionExerciseCard from "./workout-session-exercise-card";

interface WorkoutSessionViewProps {
  sessionId: string;
  workoutSession: WorkoutSession;
}

interface ExerciseCtaButtonProps {
  exercise: Exercise;
  label: string;
  onPress: (exercise: Exercise) => void;
}

function ExerciseCtaButton({
  exercise,
  label,
  onPress,
}: ExerciseCtaButtonProps) {
  const handlePress = useCallback(() => onPress(exercise), [exercise, onPress]);

  return (
    <Button
      fill={false}
      label={label}
      onPress={handlePress}
      shape="pill"
      size="sm"
    />
  );
}

export default function WorkoutSessionView({
  workoutSession,
  sessionId,
}: WorkoutSessionViewProps) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [replacingExerciseId, setReplacingExerciseId] = useState<string | null>(
    null
  );
  const [initialMuscleGroup, setInitialMuscleGroup] = useState<
    string | undefined
  >(undefined);

  const { mutateAsync } = useCreateWorkoutSessionExerciseMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workout-session"],
      });
    },
  });

  const { mutateAsync: deleteExercise } =
    useDeleteWorkoutSessionExerciseMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["workout-session"],
        });
      },
    });

  const { mutateAsync: replaceExercise } =
    useReplaceWorkoutSessionExerciseMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["workout-session"],
        });
      },
    });

  const onExercisePress = useCallback(
    async (exercise: Exercise) => {
      if (replacingExerciseId === null) {
        await mutateAsync({
          data: {
            exercise_id: exercise.id,
          },
          sessionId,
        });
        if (!IS_E2E) {
          segmentClient.track("Exercise Added", {
            exercise_id: exercise.id,
            session_id: sessionId,
          });
        }
      } else {
        await replaceExercise({
          data: {
            exercise_id: exercise.id,
          },
          exerciseId: replacingExerciseId,
        });
        if (!IS_E2E) {
          segmentClient.track("Exercise Replaced", {
            exercise_id: exercise.id,
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
    (exercise: Exercise) => (
      <ExerciseCtaButton
        exercise={exercise}
        label={replacingExerciseId === null ? "Add" : "Replace"}
        onPress={onExercisePress}
      />
    ),
    [onExercisePress, replacingExerciseId]
  );

  const handleDeleteExercise = async (exerciseId: string) => {
    await deleteExercise({
      exerciseId,
    });
    if (!IS_E2E) {
      segmentClient.track("Exercise Deleted", {
        exercise_id: exerciseId,
        session_id: sessionId,
      });
    }
  };

  const handleReplaceExercise = (exerciseId: string) => {
    const exercise = workoutSession.exercises.find((e) => e.id === exerciseId);
    const muscleGroup = exercise?.exercise.muscle_groups[0] || undefined;
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
            iconPosition="trailing"
            label="Add Exercise"
            onPress={openModal}
            variant="secondary"
          />
        )}
      </VStack>
    </>
  );
}
