import React from "react";
import { Plan } from "@/lib/models";
import { ThemedText } from "../ThemedText";
import { ScrollView, StyleSheet } from "react-native";

interface PlanViewProps {
  plan: Plan;
}

export default function PlanView({ plan }: PlanViewProps) {
  return (
    <ScrollView>
      <ThemedText style={styles.title}>Plan #{plan.id}</ThemedText>
      <ThemedText style={styles.description}>
        {plan.frequency} workouts per week at {plan.location}
      </ThemedText>
      {plan.workouts.map((workout) => (
        <ThemedText style={styles.workoutTitle}>{workout.name}</ThemedText>
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
});
