import React, { useEffect, useState } from "react";
import { Workout } from "~/lib/models";
import { H3, H4, P } from "@/components/ui/typography";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { Text } from "@/components/ui/text";
import { Zap } from "@/lib/icons/Zap";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { Link, useRouter } from "expo-router";
import {
  useCreateWorkoutSessionMutation,
  useFinishWorkoutSessionMutation,
} from "~/hooks/queries/workout-sessions";
import { Spinner } from "~/components/ui/spinner";
import { Pressable, ScrollView, View } from "react-native";
import { Card } from "../ui/card";
import { ChevronRight } from "~/lib/icons/ChevronRight";
import { Timer } from "~/lib/icons/Timer";
import ExerciseImage from "../exercises/exercise-image";
import { cn } from "~/lib/utils";

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
        `/plans/${workout.plan_id}/workouts/${workout.id}/sessions/${workoutSession.id}`,
      );
    },
  });

  const {
    mutateAsync: finishWorkoutSession,
    isPending: isFinishingWorkoutSession,
  } = useFinishWorkoutSessionMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout-session"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  const startWorkout = () => {
    createWorkoutSession({
      workoutId: workout.id,
    });
  };

  const finishWorkout = () => {
    if (activeSession) {
      finishWorkoutSession({
        sessionId: activeSession.id,
      });
    }
  };

  const activeSession = workout.sessions.find(
    (session) => session.started_at && !session.finished_at,
  );

  const [elapsedTime, setElapsedTime] = useState<string>("");

  useEffect(() => {
    if (!activeSession?.started_at) return;

    const startTime = new Date(activeSession.started_at).getTime();

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = now - startTime;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setElapsedTime(
        `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSession?.started_at]);

  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="overflow-hidden flex-1">
      <VStack className="flex-1 items-stretch gap-0">
        {activeSession && (
          <Link
            href={`/plans/${workout.plan_id}/workouts/${workout.id}/sessions/${activeSession.id}`}
            asChild
          >
            <Pressable className="flex flex-row items-center justify-between flex-1 bg-primary px-4 py-2 active:opacity-80">
              <HStack className="gap-1 flex-1 justify-start">
                <Timer size={16} className="text-primary-foreground" />
                <Text className="font-nunito-sans-bold text-sm text-primary-foreground">
                  {elapsedTime}
                </Text>
              </HStack>

              <HStack className="gap-1">
                <Text className="font-nunito-sans-bold text-sm text-primary-foreground">
                  To Workout
                </Text>
                <ArrowRight size={16} className="text-primary-foreground" />
              </HStack>
            </Pressable>
          </Link>
        )}
        <Pressable onPress={() => setIsOpen(!isOpen)}>
          <VStack className="items-stretch flex-shrink gap-4 w-full p-4">
            <H4 className="font-nunito-sans-bold text-primary">
              {workout.name}
            </H4>
            <HStack className="justify-start">
              <HStack className="gap-1">
                <Zap size={16} color="#808080" />
                <Text className="font-nunito-sans-bold text-sm">
                  {workout.exercises.length} Exercises
                </Text>
              </HStack>
            </HStack>
            <P className="text-left text-muted-foreground">
              {workout.description}
            </P>
            <ScrollView
              horizontal={!isOpen}
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
              scrollEnabled={!isOpen}
            >
              <View
                className={cn(
                  "gap-2 flex items-stretch",
                  isOpen ? "flex-col" : "flex-row",
                )}
              >
                {workout.exercises.map((exercise) => (
                  <Link
                    href={`/exercises/${exercise.exercise.id}`}
                    key={exercise.exercise.id}
                    asChild
                  >
                    <Pressable className="active:opacity-70 flex flex-row justify-between items-center">
                      <HStack className="gap-2">
                        <ExerciseImage exercise={exercise.exercise} />
                        {isOpen && (
                          <Text className="font-bold text-xs">
                            <Text className="font-bold text-xs text-primary">
                              {exercise.sets.length} x{" "}
                            </Text>
                            {exercise.exercise.name}
                          </Text>
                        )}
                      </HStack>
                      {isOpen && (
                        <ChevronRight size={16} className="text-foreground" />
                      )}
                    </Pressable>
                  </Link>
                ))}
              </View>
            </ScrollView>
            {state === "upcoming" &&
              (activeSession ? (
                <Button
                  variant="secondary"
                  onPress={finishWorkout}
                  disabled={isFinishingWorkoutSession}
                >
                  {isFinishingWorkoutSession ? (
                    <Spinner size={16} className="text-foreground" />
                  ) : (
                    <HStack className="gap-2">
                      <Text>Finish Workout</Text>
                    </HStack>
                  )}
                </Button>
              ) : (
                <Button
                  onPress={startWorkout}
                  disabled={isCreatingWorkoutSession}
                >
                  {isCreatingWorkoutSession ? (
                    <Spinner size={16} className="text-black" />
                  ) : (
                    <HStack className="gap-2">
                      <Text>Start Workout</Text>
                      <ArrowRight size={16} className="text-black" />
                    </HStack>
                  )}
                </Button>
              ))}
          </VStack>
        </Pressable>
      </VStack>
    </Card>
  );
}
