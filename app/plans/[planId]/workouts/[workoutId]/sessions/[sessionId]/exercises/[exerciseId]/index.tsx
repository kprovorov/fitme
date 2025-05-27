import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { Text } from "~/components/ui/text";
import { H4, Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import ExerciseVideo from "~/components/exercises/exercise-video";
import WorkoutSessionExerciseSetsTableView from "~/components/views/workout-session-exercise-sets-table-view";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useWorkoutSessionExerciseQuery } from "~/hooks/queries/workout-session-exercises";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { View } from "react-native";

export default function WorkoutSessionExerciseScreen() {
  const { planId, workoutId, sessionId, exerciseId } = useLocalSearchParams();

  const {
    data: workoutSessionExercise,
    isLoading,
    error,
  } = useWorkoutSessionExerciseQuery({
    variables: {
      planId: Number(planId),
      workoutId: Number(workoutId),
      sessionId: Number(sessionId),
      exerciseId: Number(exerciseId),
    },
  });

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return workoutSessionExercise ? (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: workoutSessionExercise.exercise.name,
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <KeyboardAwareScrollView
            bottomOffset={62}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <VStack className="items-stretch py-sm flex-1">
              <VStack className="items-start px-6">
                <H4 className="text-primary">
                  {workoutSessionExercise.exercise.name}
                </H4>
                <P>{workoutSessionExercise.exercise.description}</P>
              </VStack>
              {workoutSessionExercise.exercise.video_url && (
                <View className="px-6">
                  <View className="flex-1 rounded-lg w-full overflow-hidden">
                    <ExerciseVideo exercise={workoutSessionExercise.exercise} />
                  </View>
                </View>
              )}

              <VStack className="gap-4 px-6 items-stretch">
                <WorkoutSessionExerciseSetsTableView
                  planId={Number(planId)}
                  workoutId={Number(workoutId)}
                  sessionId={Number(sessionId)}
                  exerciseId={Number(exerciseId)}
                  workoutSessionExerciseSets={workoutSessionExercise.sets}
                />
              </VStack>
            </VStack>
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  ) : null;
}
