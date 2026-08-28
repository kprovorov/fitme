import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import {
  useCreateWorkoutSessionExerciseMutation,
  useDeleteWorkoutSessionExerciseMutation,
  useReplaceWorkoutSessionExerciseMutation,
} from "~/hooks/queries/workout-session-exercises";
import { IS_E2E } from "~/lib/constants";
import type { Exercise, WorkoutSession } from "~/lib/models";
import { segmentClient } from "~/lib/segment";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";
import ExercisesView from "./exercises-view";
import WorkoutSessionExerciseCard from "./workout-session-exercise-card";

interface WorkoutSessionViewProps {
  sessionId: string;
  workoutSession: WorkoutSession;
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

  const onExercisePress = async (exercise: Exercise) => {
    if (replacingExerciseId === null) {
      await mutateAsync({
        sessionId,
        data: {
          exercise_id: exercise.id,
        },
      });
      if (!IS_E2E) {
        segmentClient.track("Exercise Added", {
          session_id: sessionId,
          exercise_id: exercise.id,
        });
      }
    } else {
      await replaceExercise({
        exerciseId: replacingExerciseId,
        data: {
          exercise_id: exercise.id,
        },
      });
      if (!IS_E2E) {
        segmentClient.track("Exercise Replaced", {
          session_id: sessionId,
          exercise_id: exercise.id,
        });
      }
      setReplacingExerciseId(null);
      setInitialMuscleGroup(undefined);
    }
    setShowModal(false);
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    await deleteExercise({
      exerciseId,
    });
    if (!IS_E2E) {
      segmentClient.track("Exercise Deleted", {
        session_id: sessionId,
        exercise_id: exerciseId,
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
    <VStack className="items-stretch justify-stretch">
      <Modal
        animationType="slide"
        backdropColor="#1F1D20"
        onRequestClose={() => {
          setShowModal(!showModal);
          setReplacingExerciseId(null);
          setInitialMuscleGroup(undefined);
        }}
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
                onPress={() => {
                  setShowModal(false);
                  setReplacingExerciseId(null);
                  setInitialMuscleGroup(undefined);
                }}
                shape="pill"
                size="icon-sm"
                systemImage="xmark"
                variant="ghost"
              />
            </HStack>
            <ExercisesView
              initialMuscleGroup={initialMuscleGroup}
              itemCta={(exercise) => (
                <Button
                  fill={false}
                  label={replacingExerciseId === null ? "Add" : "Replace"}
                  onPress={() => onExercisePress(exercise)}
                  shape="pill"
                  size="sm"
                />
              )}
            />
          </VStack>
        </ScrollView>
      </Modal>

      <Card className="overflow-hidden">
        <VStack className="items-stretch gap-0">
          {workoutSession.exercises
            .sort((a, b) => a.order - b.order)
            .map((exercise, _i) => (
              <View
                className={cn("py-sm", "border-border border-b")}
                key={exercise.id}
              >
                <WorkoutSessionExerciseCard
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
                  sessionId={workoutSession.id}
                  workoutId={workoutSession.workout_id}
                  workoutSessionExercise={exercise}
                />
              </View>
            ))}
          {!workoutSession.finished_at && (
            <VStack className="flex-1 items-stretch p-3">
              <Button
                label="Add Exercise"
                onPress={() => setShowModal(true)}
                shape="pill"
                systemImage="plus"
                variant="ghost"
              />
            </VStack>
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
