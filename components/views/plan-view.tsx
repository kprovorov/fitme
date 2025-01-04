import React from "react";
import { Plan } from "@/lib/models";
import { ThemedText } from "../ThemedText";
import { ScrollView, StyleSheet } from "react-native";
import { ThemedView } from "../ThemedView";

interface PlanViewProps {
  plan: Plan;
}

export default function PlanView({ plan }: PlanViewProps) {
  return (
    <ScrollView style={styles.container}>
      <ThemedText style={styles.title}>Plan #{plan.id}</ThemedText>
      <ThemedText style={styles.description}>
        {plan.frequency} workouts per week at {plan.location}
      </ThemedText>
      {plan.workouts.map((workout) => (
        <ThemedView style={styles.workoutContainer}>
          <ThemedText style={styles.workoutTitle}>{workout.name}</ThemedText>
          <ThemedText style={styles.workoutDescription}>
            {workout.description}
          </ThemedText>
          <ThemedView>
            {workout.exercises.map((exercise) => (
              <ThemedView style={styles.exerciseContainer}>
                <ThemedText>{exercise.exercise.name}</ThemedText>
                <ThemedText style={styles.exerciseDescription}>
                  {exercise.exercise.description}
                </ThemedText>
                <ThemedView>
                  {exercise.sets.map((set) => (
                    <ThemedText key={set.id}>
                      {set.weight / 1000}kg x {set.repeats}
                    </ThemedText>
                  ))}
                </ThemedView>
              </ThemedView>
            ))}
          </ThemedView>
        </ThemedView>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    marginTop: 10,
  },
  description: {
    fontSize: 14,
  },
  workoutTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  workoutDescription: {
    fontSize: 14,
  },
  exerciseDescription: {
    fontSize: 12,
  },
  workoutContainer: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  container: {
    backgroundColor: "#f5f5f5",
    padding: 10,
  },
  exerciseContainer: {
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
});
