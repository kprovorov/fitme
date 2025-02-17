import React, { useEffect, useState } from "react";
import { Workout, WorkoutPlan } from "@/lib/models";
import { VStack } from "../ui/vstack";
import { H2, H3, H4 } from "../ui/typography";
import WorkoutCard from "./workout-card";
import { Button } from "../ui/button";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { Link } from "expo-router";
import { ChevronRight } from "~/lib/icons/ChevronRight";

interface WorkoutPlanViewProps {
  plan: WorkoutPlan;
}

export default function WorkoutPlanView({ plan }: WorkoutPlanViewProps) {
  const [nextWorkout, setNextWorkout] = useState<Workout | null>(null);

  useEffect(() => {
    const nextWorkout = plan.workouts.find((workout) => !workout.finished_at);
    if (nextWorkout) {
      setNextWorkout(nextWorkout);
    }
  }, [plan.workouts]);

  return (
    <VStack className="items-stretch">
      <H2 className="text-primary">{plan.name}</H2>
      <Text className="text-muted-foreground text-sm">{plan.description}</Text>
      <H3>Next Workout</H3>
      {!!nextWorkout && <WorkoutCard workout={nextWorkout} state="upcoming" />}

      <HStack className="justify-between">
        <H4>Upcoming</H4>
        <Link href={`/workout-plans/${plan.id}/workouts/finished`} asChild>
          <Button variant="link">
            <HStack className="gap-2">
              <Text className="text-muted-foreground">History</Text>
              <ChevronRight size={16} className="text-muted-foreground" />
            </HStack>
          </Button>
        </Link>
      </HStack>

      {plan.workouts
        .filter(
          (workout) => !workout.finished_at && workout.id !== nextWorkout?.id
        )
        .map((workout) => (
          <WorkoutCard key={workout.id} workout={workout} state="default" />
        ))}
    </VStack>
  );
}
