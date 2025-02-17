import React, { useEffect, useState } from "react";
import { Text } from "~/components/ui/text";
import { Stack, useLocalSearchParams } from "expo-router";
import { useWorkoutQuery } from "~/hooks/queries/workouts";
import { Padding } from "~/components/ui/padding";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SafeAreaProvider } from "react-native-safe-area-context";
import WorkoutView from "~/components/views/workout-view";
import { VStack } from "~/components/ui/vstack";
import { Button } from "~/components/ui/button";
import {
  useFinishWorkoutMutation,
  useStartWorkoutMutation,
} from "~/hooks/mutations/workouts";
import { useQueryClient } from "@tanstack/react-query";

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams();
  const {
    data: workout,
    isLoading,
    error,
  } = useWorkoutQuery({
    variables: {
      id: Number(id),
    },
  });

  const queryClient = useQueryClient();

  const { mutate: startWorkout } = useStartWorkoutMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout"] });
      await queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
    },
  });
  const { mutate: finishWorkout } = useFinishWorkoutMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout"] });
      await queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
    },
  });

  const [elapsedTime, setElapsedTime] = useState<string>("");

  useEffect(() => {
    if (!workout?.started_at) return;

    const startTime = new Date(workout.started_at).getTime();

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
  }, [workout?.started_at]);

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <>
      <Stack.Screen
        options={{
          title: workout?.name,
          headerBackTitle: "back",
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <ScrollView>
            <Padding>
              {workout ? (
                <VStack className="items-stretch">
                  {!workout.finished_at ? (
                    workout.started_at ? (
                      <VStack className="items-stretch">
                        <Text className="text-3xl text-center">
                          {elapsedTime}
                        </Text>
                        <Button onPress={() => finishWorkout(workout.id)}>
                          <Text>Finish Workout</Text>
                        </Button>
                      </VStack>
                    ) : (
                      <Button onPress={() => startWorkout(workout.id)}>
                        <Text>Start Workout</Text>
                      </Button>
                    )
                  ) : (
                    <Text className="text-center text-xl">
                      Workout finished{" "}
                      {(() => {
                        const diff =
                          new Date(workout.finished_at).getTime() -
                          new Date(workout.started_at).getTime();
                        const hours = Math.floor(diff / (1000 * 60 * 60));
                        const minutes = Math.floor(
                          (diff % (1000 * 60 * 60)) / (1000 * 60)
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

                  <WorkoutView workout={workout} />
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
