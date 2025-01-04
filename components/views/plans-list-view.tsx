import React from "react";
import { ThemedView } from "../ThemedView";
import { ThemedText } from "../ThemedText";
import { usePlansQuery } from "@/hooks/queries/plans";
import { ScrollView, StyleSheet } from "react-native";
import PlanCard from "../plans/plan-card";
import { Link } from "expo-router";

export default function PlansListView() {
  const { data: plans, isLoading, error } = usePlansQuery();

  if (isLoading) return <ThemedText>Loading...</ThemedText>;
  if (error) return <ThemedText>Error: {error.message}</ThemedText>;

  return (
    <ScrollView style={styles.container}>
      <ThemedText style={styles.title}>Plans</ThemedText>
      {plans?.map((plan) => (
        <Link href={`/plans/${plan.id}`} key={plan.id}>
          <PlanCard plan={plan} />
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
    padding: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    marginTop: 10,
  },
});
