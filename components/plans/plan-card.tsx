import React from "react";
import { Plan } from "@/lib/models";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";

interface PlanCardProps {
  plan: Plan;
}

export default function PlanCard({ plan }: PlanCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Plan #{plan.id}</CardTitle>
        <CardDescription>
          {plan.frequency} workouts per week at {plan.location}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
