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
import { View } from "react-native";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { useIsProQuery } from "~/hooks/revenueCat";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

interface WorkoutPlanViewProps {
  plan: WorkoutPlan;
}

export default function WorkoutPlanView({ plan }: WorkoutPlanViewProps) {
  const [nextWorkout, setNextWorkout] = useState<Workout | undefined>();
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<Workout[]>([]);

  const { data: isPro, refetch: refetchIsPro } = useIsProQuery();

  useEffect(() => {
    const nextWorkout = plan.workouts
      .sort((a, b) => a.order - b.order)
      .find((workout) => !workout.finished_at);
    setNextWorkout(nextWorkout);
    const upcomingWorkouts = plan.workouts
      .filter(
        (workout) => !workout.finished_at && workout.id !== nextWorkout?.id
      )
      .sort((a, b) => a.order - b.order);
    setUpcomingWorkouts(upcomingWorkouts);
  }, [plan.workouts]);

  return (
    <VStack className="items-stretch">
      <H2 className="text-primary">{plan.name}</H2>
      <Text className="text-muted-foreground text-sm">{plan.description}</Text>
      <H3>Next Workout</H3>
      {nextWorkout ? (
        <WorkoutCard workout={nextWorkout} state="upcoming" />
      ) : isPro ? (
        <VStack>
          <View className="animate-spin">
            <LoaderCircle size={24} className="text-primary" />
          </View>
          <H3 className="text-center text-primary">
            Nice job! You're all set!
          </H3>
          <Text className="text-center text-muted-foreground">
            AI is generating your next workout. It will be ready in a few
            minutes.
          </Text>
        </VStack>
      ) : (
        <VStack className="items-stretch">
          <Text>
            You're not subscribed to the Pro plan. Subscribe to get your next
            workout generated automatically.
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

      <H4>Upcoming</H4>

      {upcomingWorkouts.length > 0 ? (
        upcomingWorkouts.map((workout) => (
          <WorkoutCard key={workout.id} workout={workout} state="default" />
        ))
      ) : (
        <Text className="text-muted-foreground">
          No upcoming workouts.{" "}
          {nextWorkout
            ? "Once you complete your next workout, your upcoming workouts will be generated."
            : ""}
        </Text>
      )}
    </VStack>
  );
}
