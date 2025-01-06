import React from "react";
import { Plan } from "@/lib/models";
import { ScrollView, StyleSheet } from "react-native";
import { Text } from "~/components/ui/text";
import { View } from "react-native";
import { VStack } from "../ui/vstack";
import { H1, H3, H4, P } from "../ui/typography";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { HStack } from "../ui/hstack";

interface PlanViewProps {
  plan: Plan;
}

export default function PlanView({ plan }: PlanViewProps) {
  return (
    <VStack>
      <H1>Plan #{plan.id}</H1>
      <P>
        {plan.frequency} workouts per week at {plan.location}
      </P>
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
                <P>{exercise.exercise.description}</P>
                <VStack className="items-stretch">
                  {exercise.sets.map((set) => (
                    <HStack key={set.id} className="bg-neutral-100 rounded p-2">
                      <Text>
                        {set.weight ? `${set.weight / 1000}kg x ` : ""}
                        {set.repeats} repeats
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
