import React, { useEffect, useState } from "react";
import { Workout, Plan } from "@/lib/models";
import { VStack } from "../ui/vstack";
import { H3, H4 } from "../ui/typography";
import WorkoutCard from "./workout-card";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { useIsProQuery } from "~/hooks/revenueCat";
import RevenueCatUI from "react-native-purchases-ui";
import ActivePlanView from "./active-plan-view";

interface HomeViewProps {
  plan: Plan;
}

export default function HomeView({ plan }: HomeViewProps) {
  const [nextWorkout, setNextWorkout] = useState<Workout | undefined>();
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<Workout[]>([]);

  const { data: isPro, refetch: refetchIsPro } = useIsProQuery();

  useEffect(() => {
    const nextWorkout = plan.workouts.sort((a, b) => a.order - b.order)[0];
    setNextWorkout(nextWorkout);
    const upcomingWorkouts = plan.workouts
      .filter((workout) => workout.id !== nextWorkout?.id)
      .sort((a, b) => a.order - b.order);
    setUpcomingWorkouts(upcomingWorkouts);
  }, [plan.workouts]);

  return (
    <VStack className="items-stretch gap-lg px-md flex-1">
      <ActivePlanView />
      <VStack className="flex-1 items-stretch">
        <H4>Next Workout</H4>
        {nextWorkout ? (
          <WorkoutCard workout={nextWorkout} state="upcoming" />
        ) : isPro ? (
          <H3 className="text-center text-primary">
            Nice job! You&apos;re all set!
          </H3>
        ) : (
          <VStack className="items-stretch">
            <Text>
              You&apos;re not subscribed to the Pro plan. Subscribe to generate
              your next workout.
            </Text>
            <Button
              onPress={async () => {
                await RevenueCatUI.presentPaywall();
                await refetchIsPro();
              }}
            >
              <Text>Upgrade to Pro</Text>
            </Button>
          </VStack>
        )}
      </VStack>
      {!!nextWorkout && (
        <VStack className="items-stretch">
          <H4>Upcoming</H4>
          {upcomingWorkouts.map((workout) => (
            <WorkoutCard key={workout.id} workout={workout} state="default" />
          ))}
        </VStack>
      )}
    </VStack>
  );
}
