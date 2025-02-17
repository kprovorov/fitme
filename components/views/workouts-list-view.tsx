import React from "react";
import { Workout } from "~/lib/models";
import { VStack } from "../ui/vstack";
import WorkoutCard from "./workout-card";

interface WorkoutsListViewProps {
  workouts: Workout[];
}

export default function WorkoutsListView({ workouts }: WorkoutsListViewProps) {
  return (
    <VStack className="items-stretch">
      {workouts.map((workout) => (
        <WorkoutCard key={workout.id} workout={workout} />
      ))}
    </VStack>
  );
}
