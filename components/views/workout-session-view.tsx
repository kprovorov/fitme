import React from "react";
import { WorkoutSession } from "~/lib/models";
import { VStack } from "../ui/vstack";
import { H3, P } from "../ui/typography";
import { Link } from "expo-router";
import WorkoutExerciseCard from "./workout-exercise-card";

interface WorkoutSessionViewProps {
  workoutSession: WorkoutSession;
}

export default function WorkoutSessionView({
  workoutSession,
}: WorkoutSessionViewProps) {
  return (
    <VStack className="items-stretch">
      <H3 className="text-primary">{workoutSession.workout.name}</H3>
      <P>{workoutSession.workout.description}</P>
      {workoutSession.exercises.map((exercise) => (
        <Link
          key={exercise.id}
          href={`/plans/${workoutSession.workout.plan_id}/workouts/${workoutSession.workout.id}/sessions/${workoutSession.id}/exercises/${exercise.id}`}
        >
          <WorkoutExerciseCard workoutExercise={exercise} />
        </Link>
      ))}
    </VStack>
  );
}
