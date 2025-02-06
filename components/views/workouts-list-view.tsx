import React, { useEffect, useState } from "react";
import { Workout } from "~/lib/models";
import { VStack } from "../ui/vstack";
import WorkoutCard from "./workout-card";
import { Link } from "expo-router";

interface WorkoutsListViewProps {
  workouts: Workout[];
}

export default function WorkoutsListView({ workouts }: WorkoutsListViewProps) {
  const [nextWorkoutId, setNextWorkoutId] = useState<number | null>(null);

  useEffect(() => {
    const nextWorkout = workouts.find((workout) => !workout.finished_at);
    if (nextWorkout) {
      setNextWorkoutId(nextWorkout.id);
    }
  }, [workouts]);

  return (
    <VStack className="items-stretch">
      {workouts.map((workout) => (
        <Link href={`/workouts/${workout.id}`} key={workout.id}>
          <WorkoutCard
            workout={workout}
            state={
              workout.finished_at
                ? "finished"
                : nextWorkoutId === workout.id
                ? "upcoming"
                : "default"
            }
          />
        </Link>
      ))}
    </VStack>
  );
}
