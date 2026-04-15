import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import {
  useCreateWorkoutSessionExerciseMutation,
  useDeleteWorkoutSessionExerciseMutation,
  useReplaceWorkoutSessionExerciseMutation,
} from "~/hooks/queries/workout-session-exercises";
import { IS_E2E } from "~/lib/constants";
import { Plus } from "~/lib/icons/Plus";
import { X } from "~/lib/icons/X";
import type { Exercise, WorkoutSession } from "~/lib/models";
import { segmentClient } from "~/lib/segment";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
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
        <ScrollView showsVerticalScrollIndicator={false}>
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
                variant="ghost"
              >
                <Text>
                  <X className="text-foreground" size={21} />
                </Text>
              </Button>
            </HStack>
            <ExercisesView
              initialMuscleGroup={initialMuscleGroup}
              itemCta={(exercise) => (
                <Button
                  onPress={() => onExercisePress(exercise)}
                  shape="pill"
                  size="sm"
                >
                  <Text>
                    {replacingExerciseId === null ? "Add" : "Replace"}
                  </Text>
                </Button>
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
                  planId={workoutSession.workout.plan_id}
                  sessionId={workoutSession.id}
                  workoutId={workoutSession.workout_id}
                  workoutSessionExercise={exercise}
                />
              </View>
            ))}
          {!workoutSession.finished_at && (
            <VStack className="flex-1 items-stretch p-3">
              <Button
                // className="w-full bg-transparent border-2 border-dashed border-border h-16"
                onPress={() => setShowModal(true)}
                shape="pill"
                variant="ghost"
              >
                <HStack className="w-full gap-2">
                  <Plus className="text-white" size={16} />
                  <Text>Add Exercise</Text>
                </HStack>
              </Button>
            </VStack>
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
