import React from "react";
import { ThemedView } from "../ThemedView";
import { ThemedText } from "../ThemedText";
import PlannerForm from "../forms/planner/planner-form";
import { StyleSheet } from "react-native";
import { useStoreProfileMutation } from "@/hooks/queries/profiles";

export default function PlannerView() {
  const { mutate: storeProfile } = useStoreProfileMutation();

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">
        Welcome to Fitme! Your AI fitness coach
      </ThemedText>
      <ThemedText type="subtitle">
        Let's get started by answering a few questions about yourself.
      </ThemedText>
      <PlannerForm onSubmit={storeProfile} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 20,
  },
});
