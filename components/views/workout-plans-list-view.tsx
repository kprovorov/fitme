import React from "react";
import { useWorkoutPlansQuery } from "@/hooks/queries/workout-plans";
import WorkoutPlanCard from "../workout-plans/workout-plan-card";
import { Link } from "expo-router";
import { VStack } from "../ui/vstack";
import { Text } from "../ui/text";
import { WorkoutPlan } from "~/lib/models";
import { Button } from "../ui/button";

interface WorkoutPlansListViewProps {
  filter?: (plan: WorkoutPlan) => boolean;
}

export default function WorkoutPlansListView({
  filter = () => true,
}: WorkoutPlansListViewProps) {
  const { data: plans, isLoading, error } = useWorkoutPlansQuery();

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <VStack className="items-stretch">
      {plans?.filter(filter).map((plan) => (
        <Link href={`/workout-plans/${plan.id}`} key={plan.id}>
          <WorkoutPlanCard plan={plan} />
        </Link>
      ))}
      <Link href="/workout-plans/create" asChild>
        <Button>
          <Text>Generate New Workout Plan</Text>
        </Button>
      </Link>
    </VStack>
  );
}
