import React from "react";
import { Text } from "~/components/ui/text";
import { useLocalSearchParams } from "expo-router";

export default function WorkoutSessionExerciseScreen() {
  const { planId, workoutId, sessionId, exerciseId } = useLocalSearchParams();

  return <Text>Exercise</Text>;
}
