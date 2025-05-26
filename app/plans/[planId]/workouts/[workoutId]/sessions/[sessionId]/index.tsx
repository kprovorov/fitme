import React, { useEffect, useState } from "react";
import { Text } from "~/components/ui/text";
import { Stack, useLocalSearchParams } from "expo-router";
import { Padding } from "~/components/ui/padding";
import { ScrollView } from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import WorkoutSessionView from "~/components/views/workout-session-view";
import { VStack } from "~/components/ui/vstack";
import { Button } from "~/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import {
  useFinishWorkoutSessionMutation,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";

export default function WorkoutSessionScreen() {
  const { planId, workoutId, sessionId } = useLocalSearchParams();

  const {
    data: workoutSession,
    isLoading,
    error,
  } = useWorkoutSessionQuery({
    variables: {
      planId: Number(planId),
      workoutId: Number(workoutId),
      sessionId: Number(sessionId),
    },
  });

  const queryClient = useQueryClient();

  const { mutate: finishWorkoutSession } = useFinishWorkoutSessionMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout-session"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  const [elapsedTime, setElapsedTime] = useState<string>("");

  useEffect(() => {
    if (!workoutSession?.started_at) return;

    const startTime = new Date(workoutSession.started_at).getTime();

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
  }, [workoutSession?.started_at]);

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <>
      <Stack.Screen
        options={{
          title: workoutSession?.workout.name,
          headerBackTitle: "back",
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <ScrollView>
            <Padding>
              {workoutSession ? (
                <VStack className="items-stretch">
                  {!workoutSession.finished_at ? (
                    <VStack className="items-stretch">
                      <Text className="text-3xl text-center">
                        {elapsedTime}
                      </Text>
                      <Button
                        onPress={() =>
                          finishWorkoutSession({
                            planId: Number(planId),
                            workoutId: Number(workoutId),
                            sessionId: Number(sessionId),
                          })
                        }
                      >
                        <Text>Finish Workout</Text>
                      </Button>
                    </VStack>
                  ) : (
                    <Text className="text-center text-xl">
                      Workout finished{" "}
                      {(() => {
                        const diff =
                          new Date(workoutSession.finished_at).getTime() -
                          new Date(workoutSession.started_at).getTime();
                        const hours = Math.floor(diff / (1000 * 60 * 60));
                        const minutes = Math.floor(
                          (diff % (1000 * 60 * 60)) / (1000 * 60),
                        );
                        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                        return `${hours.toString().padStart(2, "0")}:${minutes
                          .toString()
                          .padStart(2, "0")}:${seconds
                          .toString()
                          .padStart(2, "0")}`;
                      })()}
                    </Text>
                  )}

                  <WorkoutSessionView workoutSession={workoutSession} />
                </VStack>
              ) : (
                <Text>Workout not found</Text>
              )}
            </Padding>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
