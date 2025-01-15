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
          <VStack key={exercise.id} className="items-stretch">
            <H4>{exercise.exercise.name}</H4>
            <Muted>{exercise.exercise.description}</Muted>
            <P>{exercise.exercise.instructions}</P>
            <VStack className="items-stretch">
              {exercise.sets.map((set) => (
                <HStack key={set.id} className="bg-neutral-100 rounded p-2">
                  <Text>
                    {set.weight_recommended
                      ? `${set.weight_recommended / 1000}kg x `
                      : ""}
                    {set.repeats_recommended} repeats
                  </Text>
                </HStack>
              ))}
            </VStack>
          </VStack>
        ))}
      </CardContent>
    </Card>
  );
}
