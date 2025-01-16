import React from "react";
import { Text } from "../ui/text";
import { Workout } from "~/lib/models";
import { HStack } from "../ui/hstack";
import { P } from "../ui/typography";
import { VStack } from "../ui/vstack";
import {
  Card,
  CardHeader,
  CardDescription,
  CardTitle,
  CardContent,
} from "../ui/card";
import { Muted } from "../ui/typography";
import { H4 } from "../ui/typography";
import { Link } from "expo-router";

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
            <VStack className="items-stretch border rounded p-4 border-border">
              <H4>{exercise.exercise.name}</H4>
              <Muted>{exercise.exercise.description}</Muted>
            </VStack>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
