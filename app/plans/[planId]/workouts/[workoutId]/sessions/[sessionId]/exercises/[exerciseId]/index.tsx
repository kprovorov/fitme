import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Text } from "~/components/ui/text";
import { H1, Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import ExerciseVideo from "~/components/exercises/exercise-video";
import WorkoutSessionExerciseSetsTableView from "~/components/views/workout-session-exercise-sets-table-view";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useWorkoutSessionExerciseQuery } from "~/hooks/queries/workout-session-exercises";

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
          title: workoutSessionExercise?.exercise.name,
          headerBackTitle: "back",
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <KeyboardAwareScrollView
            bottomOffset={62}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            <VStack className="gap-4 items-stretch py-6">
              <VStack className="items-start px-6">
                <H1>{workoutSessionExercise.exercise.name}</H1>
                <P>{workoutSessionExercise.exercise.description}</P>
              </VStack>
              {workoutSessionExercise.exercise.video_url && (
                <ExerciseVideo exercise={workoutSessionExercise.exercise} />
              )}

              <VStack className="gap-4 px-6">
                <WorkoutSessionExerciseSetsTableView
                  planId={Number(planId)}
                  workoutId={Number(workoutId)}
                  sessionId={Number(sessionId)}
                  exerciseId={Number(exerciseId)}
                  workoutSessionExerciseSets={workoutSessionExercise.sets}
                />
                <Muted>{workoutSessionExercise.exercise.instructions}</Muted>
              </VStack>
            </VStack>
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  ) : null;
}
