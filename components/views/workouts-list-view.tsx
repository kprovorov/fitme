import React from "react";
import { Text } from "react-native";
import { WorkoutPlan } from "~/lib/models";
import { VStack } from "../ui/vstack";
import WorkoutCard from "./workout-card";
import { useWorkoutPlanQuery } from "~/hooks/queries/workout-plans";
import { Link } from "expo-router";

interface WorkoutsListViewProps {
  planId: number;
}

export default function WorkoutsListView({ planId }: WorkoutsListViewProps) {
  const {
    data: plan,
    isLoading,
    error,
  } = useWorkoutPlanQuery({
    variables: { id: planId },
  });

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <VStack className="items-stretch">
      {plan?.workouts
        ?.sort((a, b) => a.order - b.order)
        .map((workout) => (
          <Link href={`/workouts/${workout.id}`} key={workout.id}>
            <WorkoutCard workout={workout} />
          </Link>
        ))}
    </VStack>
  );
}
