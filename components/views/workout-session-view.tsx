import { Link } from "expo-router";
import React, { useCallback, useState } from "react";
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
  const [showModal, setShowModal] = useState(false);

  const onExercisePress = (exercise: Exercise) => {
    setShowModal(false);
    // TODO: Add exercise to workout session
    console.log("addExercise", exercise.name);
  };

  return (
    <VStack className="items-stretch justify-stretch">
      <Modal
        animationType="slide"
        visible={showModal}
        backdropColor="black"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowModal(!showModal);
        }}
      >
        <ScrollView>
          <VStack className="p-md flex-1 items-stretch">
            {/* <Button onPress={() => setShowModal(!showModal)}>
              <Text>Hide Modal</Text>
            </Button> */}
            <ExercisesView onExercisePress={onExercisePress} />
          </VStack>
        </ScrollView>
      </Modal>
      <Card className="overflow-hidden">
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
          <Button
            variant="secondary"
            className="w-full bg-transparent border-2 border-dashed border-border"
            onPress={() => setShowModal(true)}
          >
            <HStack className="gap-2 w-full">
              <Plus size={16} className="text-white" />
              <Text>Add Exercise</Text>
            </HStack>
          </Button>
        </VStack>
      </Card>
    </VStack>
  );
}
