import React from "react";
import { Text, View } from "react-native";
import { Workout } from "~/lib/models";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { H3, P } from "../ui/typography";
import { HStack } from "../ui/hstack";
import { VStack } from "../ui/vstack";
import { ChevronRight } from "~/lib/icons/ChevronRight";
import { Padding } from "../ui/padding";

interface WorkoutCardProps {
  workout: Workout;
  state?: "upcoming" | "finished" | "default";
}

export default function WorkoutCard({
  workout,
  state = "upcoming",
}: WorkoutCardProps) {
  return (
    <Card
      className={`w-full ${state === "finished" ? "bg-muted" : ""} ${
        state === "upcoming" ? "border-primary border-2" : ""
      }`}
    >
      <Padding>
        <HStack className="items-center justify-between w-full">
          <VStack className="items-start flex-shrink">
            <H3
              className={`w-full ${
                state === "finished" ? "text-muted-foreground" : ""
              } ${state === "upcoming" ? "text-primary" : ""}`}
            >
              {workout.name}
            </H3>
            <P className="text-left">{workout.description}</P>
          </VStack>
          <VStack>
            <ChevronRight
              className={
                state === "upcoming" ? "text-primary" : "text-muted-foreground"
              }
            />
          </VStack>
        </HStack>
      </Padding>
    </Card>
  );
}
