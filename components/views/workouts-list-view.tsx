import React from "react";
import { Workout } from "~/lib/models";
import { VStack } from "../ui/vstack";
import WorkoutCard from "./workout-card";
import { H3 } from "../ui/typography";

interface WorkoutsListViewProps {
  workouts: Workout[];
}

export default function WorkoutsListView({ workouts }: WorkoutsListViewProps) {
  return (
    <VStack className="items-stretch">
      {workouts.length ? (
        <>
          {workouts.map((workout) => (
            <WorkoutCard key={workout.id} workout={workout} />
          ))}
        </>
      ) : (
        <H3 className="text-center">Nothing here yet</H3>
      )}
    </VStack>
  );
}
