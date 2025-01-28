import React from "react";
import { WorkoutPlan } from "@/lib/models";
import { VStack } from "../ui/vstack";
import { H2, H4, P } from "../ui/typography";
import WorkoutsListView from "./workouts-list-view";

interface WorkoutPlanViewProps {
  plan: WorkoutPlan;
}

export default function WorkoutPlanView({ plan }: WorkoutPlanViewProps) {
  return (
    <VStack className="items-stretch">
      <H2 className="text-center text-primary border-0">{plan.name}</H2>
      <P>{plan.description}</P>
      <H4>Workouts</H4>
      <WorkoutsListView
        workouts={plan.workouts.sort((a, b) => a.order - b.order)}
      />
    </VStack>
  );
}
