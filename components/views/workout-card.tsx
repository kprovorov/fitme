import React from "react";
import { Text } from "react-native";
import { Workout } from "~/lib/models";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

interface WorkoutCardProps {
  workout: Workout;
}

export default function WorkoutCard({ workout }: WorkoutCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{workout.name}</CardTitle>
        <CardDescription>{workout.description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
