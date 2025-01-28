import React from "react";
import { WorkoutPlan } from "@/lib/models";
import { Text } from "~/components/ui/text";
import { VStack } from "../ui/vstack";
import { H1, H4, Muted, P } from "../ui/typography";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { HStack } from "../ui/hstack";

interface WorkoutPlanViewProps {
  plan: WorkoutPlan;
}

export default function WorkoutPlanView({ plan }: WorkoutPlanViewProps) {
  return (
    <VStack>
      <H1 className="text-center">{plan.name}</H1>
      <P className="text-center font-semibold">
        {plan.frequency} workouts per week at {plan.place}
      </P>
      <P className="text-center">{plan.description}</P>
      {plan.workouts.map((workout) => (
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
                    <HStack key={set.id} className="border border-border rounded p-2">
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
      ))}
    </VStack>
  );
}
