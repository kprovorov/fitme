import React from "react";
import { Workout } from "~/lib/models";
import { VStack } from "../ui/vstack";
import {
  Card,
  CardHeader,
  CardDescription,
  CardTitle,
  CardContent,
} from "../ui/card";
import { Muted, P } from "../ui/typography";
import { H4 } from "../ui/typography";
import { Link } from "expo-router";
import WorkoutExerciseSetsTableView from "./workout-exercise-sets-table-view";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import WorkoutExerciseCard from "./workout-exercise-card";

interface WorkoutViewProps {
  workout: Workout;
}

export default function WorkoutView({ workout }: WorkoutViewProps) {
  return (
    <Card key={workout.id}>
      <CardHeader>
        <CardTitle>{workout.name}</CardTitle>
        <CardDescription>{workout.description}</CardDescription>
      </CardHeader>
      <CardContent className="gap-8">
        {workout.exercises.map((exercise) => (
          <Link key={exercise.id} href={`/workout-exercise/${exercise.id}`}>
            <WorkoutExerciseCard workoutExercise={exercise} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
