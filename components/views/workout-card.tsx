import React from "react";
import { Workout } from "~/lib/models";
import { H4, P } from "@/components/ui/typography";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { Text } from "@/components/ui/text";
import { Zap } from "@/lib/icons/Zap";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { useRouter } from "expo-router";
import { useCreateWorkoutSessionMutation } from "~/hooks/queries/workout-sessions";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { View } from "react-native";

interface WorkoutCardProps {
  workout: Workout;
  state?: "upcoming" | "finished" | "default";
}

export default function WorkoutCard({
  workout,
  state = "default",
}: WorkoutCardProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const {
    mutateAsync: createWorkoutSession,
    isPending: isCreatingWorkoutSession,
  } = useCreateWorkoutSessionMutation({
    onSuccess: (workoutSession) => {
      queryClient.invalidateQueries({ queryKey: ["workout"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      router.push(
        `/plans/${workout.plan_id}/workouts/${workout.id}/sessions/${workoutSession.id}`
      );
    },
  });

  const startWorkout = () => {
    createWorkoutSession({
      planId: workout.plan_id,
      planWorkoutId: workout.id,
    });
  };

  return (
    <VStack className="items-stretch flex-shrink p-4 gap-4 w-full">
      <H4 className={`font-nunito-sans-bold text-primary`}>{workout.name}</H4>
      <HStack className="justify-start">
        <HStack className="gap-1">
          <Zap size={16} color="#808080" />
          <Text className="font-nunito-sans-bold text-sm">
            {workout.exercises.length} Exercises
          </Text>
        </HStack>
      </HStack>
      <P className="text-left text-sm text-muted-foreground">
        {workout.description}
      </P>
      {state === "upcoming" && (
        <Button onPress={startWorkout} disabled={isCreatingWorkoutSession}>
          {isCreatingWorkoutSession ? (
            <View className="animate-spin">
              <LoaderCircle size={16} className="text-black" />
            </View>
          ) : (
            <HStack className="gap-2">
              <Text>Start Workout</Text>
              <ArrowRight size={16} className="text-black" />
            </HStack>
          )}
        </Button>
      )}
    </VStack>
  );
}
