import React, { useEffect, useState } from "react";
import { Workout, Plan } from "@/lib/models";
import { VStack } from "../ui/vstack";
import { H3, H4 } from "../ui/typography";
import WorkoutCard from "./workout-card";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { useIsProQuery } from "~/hooks/revenueCat";
import RevenueCatUI from "react-native-purchases-ui";
import { useGenerateWorkoutPlanMutation } from "~/hooks/mutations/workout-plans";
import { useQueryClient } from "@tanstack/react-query";
import { Spinner } from "~/components/ui/spinner";
import ActivePlanView from "./active-plan-view";

interface HomeViewProps {
  plan: Plan;
}

export default function HomeView({ plan }: HomeViewProps) {
  const queryClient = useQueryClient();

  const [nextWorkout, setNextWorkout] = useState<Workout | undefined>();
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<Workout[]>([]);

  const { mutate: generateWorkoutPlan, isPending: isWorkoutPlanGenerating } =
    useGenerateWorkoutPlanMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
      },
    });

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
          <VStack className="items-stretch">
            <H3 className="text-center text-primary">
              Nice job! You&apos;re all set!
            </H3>
            {plan.is_generating ? (
              <VStack>
                <Text className="text-center text-muted-foreground">
                  AI is generating your next workout. It will be ready in a few
                  minutes.
                </Text>
                <Spinner size={24} className="text-primary" />
              </VStack>
            ) : (
              <Button
                disabled={isWorkoutPlanGenerating}
                onPress={() => generateWorkoutPlan({ id: plan.id })}
              >
                {isWorkoutPlanGenerating ? (
                  <Spinner size={16} className="text-black" />
                ) : (
                  <Text>Generate your next workout</Text>
                )}
              </Button>
            )}
          </VStack>
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
