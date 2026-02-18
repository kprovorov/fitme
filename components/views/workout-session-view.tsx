import React, { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { Plus } from "~/lib/icons/Plus";
import { Exercise, WorkoutSession } from "~/lib/models";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { VStack } from "../ui/vstack";
import ExercisesView from "./exercises-view";
import WorkoutSessionExerciseCard from "./workout-session-exercise-card";
import { X } from "~/lib/icons/X";
import {
  useCreateWorkoutSessionExerciseMutation,
  useDeleteWorkoutSessionExerciseMutation,
  useReplaceWorkoutSessionExerciseMutation,
} from "~/hooks/queries/workout-session-exercises";
import { QueryClient, useQueryClient } from "@tanstack/react-query";

interface WorkoutSessionViewProps {
  workoutSession: WorkoutSession;
  planId: number;
  workoutId: number;
  sessionId: number;
}

export default function WorkoutSessionView({
  workoutSession,
  planId,
  workoutId,
  sessionId,
}: WorkoutSessionViewProps) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [replacingExerciseId, setReplacingExerciseId] = useState<number | null>(
    null,
  );
  const [initialMuscleGroup, setInitialMuscleGroup] = useState<
    string | undefined
  >(undefined);

  const { mutateAsync } = useCreateWorkoutSessionExerciseMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workout-session", { planId, workoutId, sessionId }],
      });
    },
  });

  const { mutateAsync: deleteExercise } =
    useDeleteWorkoutSessionExerciseMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["workout-session", { planId, workoutId, sessionId }],
        });
      },
    });

  const { mutateAsync: replaceExercise } =
    useReplaceWorkoutSessionExerciseMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["workout-session", { planId, workoutId, sessionId }],
        });
      },
    });

  const onExercisePress = async (exercise: Exercise) => {
    if (replacingExerciseId !== null) {
      await replaceExercise({
        planId,
        workoutId,
        sessionId,
        exerciseId: replacingExerciseId,
        data: {
          exercise_id: exercise.id,
        },
      });
      setReplacingExerciseId(null);
      setInitialMuscleGroup(undefined);
    } else {
      await mutateAsync({
        planId,
        workoutId,
        sessionId,
        data: {
          exercise_id: exercise.id,
        },
      });
    }
    setShowModal(false);
  };

  const handleDeleteExercise = async (exerciseId: number) => {
    await deleteExercise({
      planId,
      workoutId,
      sessionId,
      exerciseId,
    });
  };

  const handleReplaceExercise = (exerciseId: number) => {
    const exercise = workoutSession.exercises.find((e) => e.id === exerciseId);
    const muscleGroup =
      exercise?.exercise.muscle_groups[0] || undefined;
    setReplacingExerciseId(exerciseId);
    setInitialMuscleGroup(muscleGroup);
    setShowModal(true);
  };

  return (
    <VStack className="items-stretch justify-stretch">
      <Modal
        animationType="slide"
        backdropColor="#1F1D20"
        visible={showModal}
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowModal(!showModal);
          setReplacingExerciseId(null);
          setInitialMuscleGroup(undefined);
        }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <VStack className="p-md flex-1 items-stretch bg-background">
            <HStack className="justify-end">
              <Button
                variant="ghost"
                size="icon-sm"
                onPress={() => {
                  setShowModal(false);
                  setReplacingExerciseId(null);
                  setInitialMuscleGroup(undefined);
                }}
                shape="pill"
              >
                <Text>
                  <X size={21} className="text-foreground" />
                </Text>
              </Button>
            </HStack>
            <ExercisesView
              onExercisePress={onExercisePress}
              initialMuscleGroup={initialMuscleGroup}
              itemCta={(exercise) => (
                <Button
                  size="sm"
                  shape="pill"
                  onPress={() => onExercisePress(exercise)}
                >
                  <Text>
                    {replacingExerciseId !== null ? "Replace" : "Add"}
                  </Text>
                </Button>
              )}
            />
          </VStack>
        </ScrollView>
      </Modal>

      <Card className="overflow-hidden">
        <VStack className="gap-0 items-stretch">
          {workoutSession.exercises
            .sort((a, b) => a.order - b.order)
            .map((exercise, i) => (
              <View
                key={exercise.id}
                className={cn("py-sm", "border-b border-border")}
              >
                <WorkoutSessionExerciseCard
                  workoutSessionExercise={exercise}
                  onDelete={() => handleDeleteExercise(exercise.id)}
                  onReplace={() => handleReplaceExercise(exercise.id)}
                  planId={planId}
                  workoutId={workoutId}
                  sessionId={sessionId}
                />
              </View>
            ))}
          {!workoutSession.finished_at && (
            <VStack className="p-3 items-stretch flex-1">
              <Button
                variant="ghost"
                // className="w-full bg-transparent border-2 border-dashed border-border h-16"
                onPress={() => setShowModal(true)}
                shape="pill"
              >
                <HStack className="gap-2 w-full">
                  <Plus size={16} className="text-white" />
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
