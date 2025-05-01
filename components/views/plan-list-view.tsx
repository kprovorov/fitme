import React from "react";
import { usePlansQuery } from "~/hooks/queries/plans";
import { Link } from "expo-router";
import { VStack } from "../ui/vstack";
import { Text } from "../ui/text";
import { Button } from "../ui/button";
import { useIsProQuery } from "~/hooks/revenueCat";
import PlanCard from "../plans/plan-card";

export default function PlansListView() {
  const { data: plans } = usePlansQuery();
  const { data: isPro } = useIsProQuery();

  return (
    <VStack className="items-stretch">
      {plans?.map((plan) => (
        <Link href={`/plans/${plan.id}`} key={plan.id}>
          <PlanCard plan={plan} />
        </Link>
      ))}
      <Link href="/planner" asChild>
        <Button>
          <Text>Create New Workout Plan</Text>
        </Button>
      </Link>
    </VStack>
  );
}
