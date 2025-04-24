import React from "react";
import { VStack } from "../ui/vstack";
import { Workout } from "~/lib/models";
import WorkoutCard from "./workout-card";

interface WorkoutListProps {
  workouts: Workout[];
}

export default function WorkoutList({ workouts }: WorkoutListProps) {
  return (
    <VStack className="gap-sm items-stretch flex-1">
      {workouts.map((workout) => (
        <WorkoutCard key={workout.id} workout={workout} />
      ))}
    </VStack>
  );
}
