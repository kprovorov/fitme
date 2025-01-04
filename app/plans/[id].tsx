import React from "react";
import PlanView from "@/components/views/plan-view";
import { useLocalSearchParams } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { usePlanQuery } from "@/hooks/queries/plans";

export default function PlanScreen() {
  const { id } = useLocalSearchParams();

  const {
    data: plan,
    isLoading,
    error,
  } = usePlanQuery({
    variables: { id: Number(id) },
  });

  if (isLoading) return <ThemedText>Loading...</ThemedText>;
  if (error) return <ThemedText>Error: {error.message}</ThemedText>;

  return plan ? (
    <PlanView plan={plan} />
  ) : (
    <ThemedText>Plan not found</ThemedText>
  );
}
