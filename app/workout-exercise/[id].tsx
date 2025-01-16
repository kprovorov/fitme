import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HStack } from "~/components/ui/hstack";
import { Padding } from "~/components/ui/padding";
import { Text } from "~/components/ui/text";
import { H1, Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useWorkoutExerciseQuery } from "~/hooks/queries/workout-exercises";

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

  return (
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
                <P>{workoutExercise?.exercise.description}</P>
                <Muted>{workoutExercise?.exercise.instructions}</Muted>
                <VStack className="items-stretch">
                  {workoutExercise?.sets.map((set) => (
                    <HStack key={set.id} className="bg-white rounded p-2">
                      <Text>
                        {set.weight_recommended
                          ? `${set.weight_recommended / 1000}kg x `
                          : ""}
                        {set.repeats_recommended} repeats
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              </VStack>
            </Padding>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
