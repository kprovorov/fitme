import React from "react";
import { PlanWorkout } from "~/lib/models";
import { VStack } from "../ui/vstack";
import {
  Card,
  CardHeader,
  CardDescription,
  CardTitle,
  CardContent,
} from "../ui/card";
import { H3, Muted, P } from "../ui/typography";
import { H4 } from "../ui/typography";
import { Link } from "expo-router";
import WorkoutExerciseSetsTableView from "./workout-exercise-sets-table-view";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import WorkoutExerciseCard from "./workout-exercise-card";
import { Button } from "../ui/button";
import { PencilIcon } from "lucide-react-native";

interface WorkoutViewProps {
  workout: PlanWorkout;
}

export default function WorkoutView({ workout }: WorkoutViewProps) {
  return (
    <VStack className="items-stretch">
      <H3 className="text-primary">{workout.name}</H3>
      <P>{workout.description}</P>
      {workout.exercises.map((exercise) => (
        <Link key={exercise.id} href={`/workout-exercise/${exercise.id}`}>
          <WorkoutExerciseCard workoutExercise={exercise} />
        </Link>
      ))}
    </VStack>
  );
}
