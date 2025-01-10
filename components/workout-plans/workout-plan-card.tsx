import React from "react";
import { WorkoutPlan } from "@/lib/models";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";

interface WorkoutPlanCardProps {
  plan: WorkoutPlan;
}

export default function WorkoutPlanCard({ plan }: WorkoutPlanCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>
          {plan.frequency} workouts per week at {plan.place}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
