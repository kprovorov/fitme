import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { Text } from "~/components/ui/text";
import { H1, Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useWorkoutExerciseQuery } from "~/hooks/queries/workout-exercises";
import ExerciseVideo from "~/components/exercises/exercise-video";
import WorkoutExerciseSetsTableView from "~/components/views/workout-exercise-sets-table-view";
import { HStack } from "~/components/ui/hstack";

export default function WorkoutExerciseScreen() {
  const { id } = useLocalSearchParams();

  const {
    data: workoutExercise,
    isLoading,
    error,
  } = useWorkoutExerciseQuery({
    variables: {
      id: Number(id),
    },
  });

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return workoutExercise ? (
    <>
      <Stack.Screen
        options={{
          title: workoutExercise?.exercise.name,
          headerBackTitle: "back",
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <ScrollView className="h-full" showsVerticalScrollIndicator={false}>
            <VStack className="gap-4 items-stretch py-6">
              <VStack className="items-start px-6">
                <H1>{workoutExercise.exercise.name}</H1>
                <P>{workoutExercise.exercise.description}</P>
              </VStack>
              {workoutExercise.exercise.video_url && (
                <ExerciseVideo exercise={workoutExercise.exercise} />
              )}

              <VStack className="gap-4 px-6">
                <Muted>{workoutExercise.exercise.instructions}</Muted>
                <WorkoutExerciseSetsTableView
                  workoutExerciseSets={workoutExercise.sets}
                />
              </VStack>
            </VStack>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  ) : null;
}
