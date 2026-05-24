import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import WorkoutSessionView from "~/components/views/workout-session-view";
import {
  useFinishWorkoutSessionMutation,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";

export default function WorkoutSessionScreen() {
  const {
    planId: _planId,
    workoutId: _workoutId,
    sessionId,
  } = useLocalSearchParams();

  const { data: workoutSession } = useWorkoutSessionQuery({
    variables: {
      sessionId: sessionId as string,
    },
  });

  const queryClient = useQueryClient();

  const { mutate: finishWorkoutSession } = useFinishWorkoutSessionMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout-session"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["exercise-history"] });
    },
  });

  const [elapsedTime, setElapsedTime] = useState<string>("");

  useEffect(() => {
    if (!workoutSession?.started_at) {
      return;
    }

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
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [workoutSession?.started_at]);

  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
            color: "#C0FF38",
          },
          title: workoutSession?.workout?.name ?? "",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {workoutSession && (
          <VStack
            className="flex-1 items-stretch px-md pt-md"
            style={{ paddingBottom: insets.bottom }}
          >
            <WorkoutSessionView
              sessionId={sessionId as string}
              workoutSession={workoutSession}
            />
            {workoutSession.finished_at ? (
              <Text className="text-center text-xl">
                Workout finished {(() => {
                  const diff =
                    new Date(workoutSession.finished_at).getTime() -
                    new Date(workoutSession.started_at).getTime();
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  const minutes = Math.floor(
                    (diff % (1000 * 60 * 60)) / (1000 * 60)
                  );
                  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
                })()}
              </Text>
            ) : (
              <VStack className="items-stretch">
                <Text className="text-center text-3xl">{elapsedTime}</Text>
                <Button
                  onPress={() =>
                    finishWorkoutSession({
                      sessionId: sessionId as string,
                    })
                  }
                  testID="finish-workout-button"
                >
                  <Text>Finish Workout</Text>
                </Button>
              </VStack>
            )}
          </VStack>
        )}
      </ScrollView>
    </>
  );
}
