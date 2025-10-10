import { Link } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView } from "react-native";
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
import { useCreateWorkoutSessionExerciseMutation } from "~/hooks/queries/workout-session-exercises";
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
                <Button size="sm" onPress={() => onExercisePress(exercise)}>
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
            <Link
              key={exercise.id}
              href={`/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${exercise.id}`}
              className={cn("py-sm", i !== 0 && "border-t border-border")}
              asChild
            >
              <Pressable className="flex-1 active:opacity-80">
                <WorkoutSessionExerciseCard workoutSessionExercise={exercise} />
              </Pressable>
            </Link>
          ))}
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
        </VStack>
      </Card>
    </VStack>
  );
}
