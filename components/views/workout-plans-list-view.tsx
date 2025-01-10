import React from "react";
import { useWorkoutPlansQuery } from "@/hooks/queries/workout-plans";
import WorkoutPlanCard from "../workout-plans/workout-plan-card";
import { Link } from "expo-router";
import { VStack } from "../ui/vstack";
import { Text } from "../ui/text";

export default function WorkoutPlansListView() {
  const { data: plans, isLoading, error } = useWorkoutPlansQuery();

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <VStack className="items-stretch">
      {plans?.map((plan) => (
        <Link href={`/plans/${plan.id}`} key={plan.id}>
          <WorkoutPlanCard plan={plan} />
        </Link>
      ))}
    </VStack>
  );
}
