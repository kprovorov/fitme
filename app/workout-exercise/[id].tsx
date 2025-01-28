import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { Text } from "~/components/ui/text";
import { H1, Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import WorkoutExerciseSetRowView from "~/components/views/workout-exercise-set-row-view";
import { useWorkoutExerciseQuery } from "~/hooks/queries/workout-exercises";
import ExerciseVideo from "~/components/exercises/exercise-video";

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
          <ScrollView>
            <Padding>
              <VStack>
                <H1>{workoutExercise?.exercise.name}</H1>
                {workoutExercise?.exercise.media && (
                  <ExerciseVideo exercise={workoutExercise.exercise} />
                )}
                <P>{workoutExercise?.exercise.description}</P>
                <Muted>{workoutExercise?.exercise.instructions}</Muted>
                <VStack className="items-stretch w-full">
                  {workoutExercise?.sets
                    .sort((a, b) => a.order - b.order)
                    .map((workoutExerciseSet) => (
                      <WorkoutExerciseSetRowView
                        key={workoutExerciseSet.id}
                        workoutExerciseSet={workoutExerciseSet}
                      />
                    ))}
                </VStack>
              </VStack>
            </Padding>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  ) : null;
}
