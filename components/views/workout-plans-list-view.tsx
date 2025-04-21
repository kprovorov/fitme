import React from "react";
import { usePlansQuery } from "~/hooks/queries/plans";
import WorkoutPlanCard from "../workout-plans/workout-plan-card";
import { Link } from "expo-router";
import { VStack } from "../ui/vstack";
import { Text } from "../ui/text";
import { Button } from "../ui/button";
import { useIsProQuery } from "~/hooks/revenueCat";
import RevenueCatUI from "react-native-purchases-ui";

export default function WorkoutPlansListView() {
  const { data: plans, isLoading, error } = usePlansQuery();

  const { data: isPro } = useIsProQuery();

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <VStack className="items-stretch">
      {plans?.map((plan) => (
        <Link href={`/workout-plans/${plan.id}`} key={plan.id}>
          <WorkoutPlanCard plan={plan} />
        </Link>
      ))}
      {isPro ? (
        <Link href="/workout-plans/create" asChild>
          <Button>
            <Text>Generate New Workout Plan</Text>
          </Button>
        </Link>
      ) : (
        <Button onPress={async () => await RevenueCatUI.presentPaywall()}>
          <Text>Generate New Workout Plan</Text>
        </Button>
      )}
    </VStack>
  );
}
