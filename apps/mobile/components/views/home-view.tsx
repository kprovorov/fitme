import type { Plan, Workout } from "@fitme/core";
import { useEffect, useState } from "react";
import { H3, H4 } from "../ui/typography";
import { VStack } from "../ui/vstack";
import ActivePlanView from "./active-plan-view";
import WorkoutCard from "./workout-card";

interface HomeViewProps {
  plan: Plan;
}

export default function HomeView({ plan }: HomeViewProps) {
  const [nextWorkout, setNextWorkout] = useState<Workout | undefined>();
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<Workout[]>([]);

  useEffect(() => {
    const nextWorkout = plan.workouts.sort((a, b) => a.order - b.order)[0];
    setNextWorkout(nextWorkout);
    const upcomingWorkouts = plan.workouts
      .filter((workout) => workout.id !== nextWorkout?.id)
      .sort((a, b) => a.order - b.order);
    setUpcomingWorkouts(upcomingWorkouts);
  }, [plan.workouts]);

  return (
    <VStack className="flex-1 items-stretch gap-lg px-md">
      <ActivePlanView />
      <VStack className="flex-1 items-stretch">
        <H4>Next Workout</H4>
        {nextWorkout ? (
          <WorkoutCard state="upcoming" workout={nextWorkout} />
        ) : (
          <H3 className="text-center text-primary">
            Nice job! You&apos;re all set!
          </H3>
        )}
      </VStack>
      {!!nextWorkout && (
        <VStack className="items-stretch">
          <H4>Upcoming</H4>
          {upcomingWorkouts.map((workout) => (
            <WorkoutCard key={workout.id} state="default" workout={workout} />
          ))}
        </VStack>
      )}
    </VStack>
  );
}
