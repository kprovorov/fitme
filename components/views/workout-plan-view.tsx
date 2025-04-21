import React, { useEffect, useState } from "react";
import { Workout, Plan } from "@/lib/models";
import { VStack } from "../ui/vstack";
import { H2, H3, H4 } from "../ui/typography";
import WorkoutCard from "./workout-card";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { useIsProQuery } from "~/hooks/revenueCat";
import RevenueCatUI from "react-native-purchases-ui";
import { useGenerateWorkoutPlanMutation } from "~/hooks/mutations/workout-plans";
import { useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";

interface WorkoutPlanViewProps {
  plan: Plan;
}

export default function WorkoutPlanView({ plan }: WorkoutPlanViewProps) {
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
    <VStack className="items-stretch">
      <H2 className="text-primary">{plan.name}</H2>
      <Text className="text-muted-foreground text-sm">{plan.description}</Text>
      <H3>Next Workout</H3>
      {nextWorkout ? (
        <WorkoutCard workout={nextWorkout} state="upcoming" />
      ) : isPro ? (
        <VStack className="items-stretch">
          <H3 className="text-center text-primary">
            Nice job! You're all set!
          </H3>
          {plan.is_generating ? (
            <VStack>
              <Text className="text-center text-muted-foreground">
                AI is generating your next workout. It will be ready in a few
                minutes.
              </Text>
              <View className="animate-spin">
                <LoaderCircle size={24} className="text-primary" />
              </View>
            </VStack>
          ) : (
            <Button
              disabled={isWorkoutPlanGenerating}
              onPress={() => generateWorkoutPlan({ id: plan.id })}
            >
              {isWorkoutPlanGenerating ? (
                <View className="animate-spin">
                  <LoaderCircle size={16} className="text-black" />
                </View>
              ) : (
                <Text>Generate your next workout</Text>
              )}
            </Button>
          )}
        </VStack>
      ) : (
        <VStack className="items-stretch">
          <Text>
            You're not subscribed to the Pro plan. Subscribe to generate your
            next workout.
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
      {!!nextWorkout && (
        <>
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
        </>
      )}
    </VStack>
  );
}
