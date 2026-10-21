import type { Workout } from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { H4 } from "@/components/ui/typography";
import { VStack } from "@/components/ui/vstack";
import { Zap } from "@/lib/icons/Zap";
import { confirmFinishWorkout } from "~/hooks/finish-workout-session";
import {
  useCreateWorkoutSessionMutation,
  useFinishWorkoutSessionMutation,
} from "~/hooks/queries/workout-sessions";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { ChevronRight } from "~/lib/icons/ChevronRight";
import { Timer } from "~/lib/icons/Timer";
import { cn } from "~/lib/utils";
import ExerciseImage from "../exercises/exercise-image";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

interface WorkoutCardProps {
  state?: "upcoming" | "finished" | "default";
  workout: Workout;
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
    createWorkoutSession({ workoutId: workout.id });
  };

  const finishWorkout = async () => {
    if (!activeSession) {
      return;
    }
    const sessionId = activeSession.id;
    if (await confirmFinishWorkout(queryClient, sessionId)) {
      finishWorkoutSession({ sessionId });
    }
  };

  const activeSession = workout.sessions.find(
    (session) => session.started_at && !session.finished_at
  );

  const [elapsedTime, setElapsedTime] = useState<string>("");

  useEffect(() => {
    if (!activeSession?.started_at) {
      return;
    }

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
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSession?.started_at]);

  const [isOpen, setIsOpen] = useState(false);
  const toggleOpen = useCallback(() => setIsOpen(!isOpen), [isOpen]);

  return (
    <Card className="flex-1">
      <VStack className="flex-1 items-stretch gap-4">
        {activeSession && (
          <Link
            asChild
            href={`/plans/${workout.plan_id}/workouts/${workout.id}/sessions/${activeSession.id}`}
          >
            <Pressable className="flex-row items-center justify-between rounded-xl border-continuous bg-primary px-3 py-2 active:opacity-80">
              <HStack className="flex-1 justify-start gap-1">
                <Timer className="text-primary-foreground" size={16} />
                <Text className="font-nunito-sans-bold text-primary-foreground text-subhead">
                  {elapsedTime}
                </Text>
              </HStack>

              <HStack className="gap-1">
                <Text className="font-nunito-sans-bold text-primary-foreground text-subhead">
                  To Workout
                </Text>
                <ArrowRight className="text-primary-foreground" size={16} />
              </HStack>
            </Pressable>
          </Link>
        )}
        <Pressable onPress={toggleOpen}>
          <VStack className="w-full flex-shrink items-stretch gap-4">
            <H4 className="font-nunito-sans-bold text-primary">
              {workout.name}
            </H4>
            <HStack className="justify-start">
              <HStack className="gap-1">
                <Zap color="#808080" size={16} />
                <Text className="font-nunito-sans-bold text-subhead">
                  {workout.exercises.length} Exercises
                </Text>
              </HStack>
            </HStack>
            <ScrollView
              contentContainerClassName="gap-2"
              contentInsetAdjustmentBehavior="automatic"
              horizontal={!isOpen}
              scrollEnabled={!isOpen}
              showsHorizontalScrollIndicator={false}
            >
              <View
                className={cn(
                  "flex items-stretch gap-2",
                  isOpen ? "flex-col" : "flex-row"
                )}
              >
                {workout.exercises.map((exercise) => (
                  <Link
                    asChild
                    href={`/exercises/${exercise.exercise.id}`}
                    key={exercise.exercise.id}
                  >
                    <Pressable className="flex flex-row items-center justify-between active:opacity-70">
                      <HStack className="gap-2">
                        <ExerciseImage exercise={exercise.exercise} />
                        {isOpen ? (
                          <Text className="font-bold text-footnote">
                            <Text className="font-bold text-footnote text-primary">
                              {exercise.sets.length} x{" "}
                            </Text>
                            {exercise.exercise.name}
                          </Text>
                        ) : null}
                      </HStack>
                      {isOpen ? (
                        <ChevronRight className="text-foreground" size={16} />
                      ) : null}
                    </Pressable>
                  </Link>
                ))}
              </View>
            </ScrollView>
          </VStack>
        </Pressable>
        {state === "upcoming" && (
          <VStack className="items-stretch">
            {activeSession ? (
              <Button
                isLoading={isFinishingWorkoutSession}
                label="Finish Workout"
                onPress={finishWorkout}
                variant="secondary"
              />
            ) : (
              <Button
                isLoading={isCreatingWorkoutSession}
                label="Start Workout"
                onPress={startWorkout}
                systemImage="arrow.right"
                testID="start-workout-button"
              />
            )}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
