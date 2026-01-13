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

  const onExercisePress = async (exercise: Exercise) => {
    await mutateAsync({
      planId,
      workoutId,
      sessionId,
      data: {
        exercise_id: exercise.id,
      },
    });
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

  return (
    <VStack className="items-stretch justify-stretch">
      <Modal
        animationType="slide"
        backdropColor="#1F1D20"
        visible={showModal}
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowModal(!showModal);
        }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <VStack className="p-md flex-1 items-stretch bg-background">
            <HStack className="justify-end">
              <Button
                variant="ghost"
                size="icon-sm"
                onPress={() => setShowModal(false)}
                shape="pill"
              >
                <Text>
                  <X size={21} className="text-foreground" />
                </Text>
              </Button>
            </HStack>
            <ExercisesView
              onExercisePress={onExercisePress}
              itemCta={(exercise) => (
                <Button
                  size="sm"
                  shape="pill"
                  onPress={() => onExercisePress(exercise)}
                >
                  <Text>Add</Text>
                </Button>
              )}
            />
          </VStack>
        </ScrollView>
      </Modal>

      <Card className="overflow-hidden py-3">
        <VStack className="gap-0">
          {workoutSession.exercises.map((exercise, i) => (
            <View
              key={exercise.id}
              className={cn("py-sm", i !== 0 && "border-t border-border")}
            >
              <WorkoutSessionExerciseCard
                workoutSessionExercise={exercise}
                onDelete={() => handleDeleteExercise(exercise.id)}
                planId={planId}
                workoutId={workoutId}
                sessionId={sessionId}
              />
            </View>
          ))}
          {!workoutSession.finished_at && (
            <VStack className="px-3 w-full">
              <Button
                variant="secondary"
                className="w-full bg-transparent border-2 border-dashed border-border h-16"
                onPress={() => setShowModal(true)}
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
