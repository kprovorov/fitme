import React from "react";
import { ThemedView } from "../ThemedView";
import { Plan } from "@/lib/models";
import { ThemedText } from "../ThemedText";
import { StyleSheet } from "react-native";
interface PlanCardProps {
  plan: Plan;
}

export default function PlanCard({ plan }: PlanCardProps) {
  // card with plan id as a title, location and a frequency in the description
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Plan #{plan.id}</ThemedText>
      <ThemedText style={styles.description}>
        {plan.frequency} workouts per week at {plan.location}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
  },
  description: {
    fontSize: 14,
  },
});
