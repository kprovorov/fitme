import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
  const { workoutSessionId } = useLocalSearchParams();
  const router = useRouter();

  const { data: workoutSession } = useWorkoutSessionQuery({
    variables: {
      sessionId: workoutSessionId as string,
    },
  });

  const queryClient = useQueryClient();

  const { mutate: finishWorkoutSession } = useFinishWorkoutSessionMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout-session"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["exercise-history"] });
      router.replace(`/workout-sessions/${workoutSessionId}/summary`);
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

  const handleFinishWorkout = useCallback(
    () =>
      finishWorkoutSession({
        sessionId: workoutSessionId as string,
      }),
    [finishWorkoutSession, workoutSessionId]
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            color: "#C0FF38",
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: workoutSession?.workout?.name ?? "",
        }}
      />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {workoutSession ? (
          <VStack
            className="flex-1 items-stretch px-md pt-md"
            style={{ paddingBottom: insets.bottom }}
          >
            <WorkoutSessionView
              sessionId={workoutSessionId as string}
              workoutSession={workoutSession}
            />
            {workoutSession.finished_at ? (
              <Text className="text-center text-title-2">
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
                <Text className="text-center text-large-title">
                  {elapsedTime}
                </Text>
                <Button
                  onPress={handleFinishWorkout}
                  testID="finish-workout-button"
                >
                  <Text>Finish Workout</Text>
                </Button>
              </VStack>
            )}
          </VStack>
        ) : null}
      </ScrollView>
    </>
  );
}
