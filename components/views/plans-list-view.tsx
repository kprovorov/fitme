import React from "react";
import { usePlansQuery } from "@/hooks/queries/plans";
import { ScrollView } from "react-native";
import PlanCard from "../plans/plan-card";
import { Link } from "expo-router";
import { VStack } from "../ui/vstack";
import { Text } from "../ui/text";

export default function PlansListView() {
  const { data: plans, isLoading, error } = usePlansQuery();

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <ScrollView className="p-4">
      <VStack className="items-stretch">
        {plans?.map((plan) => (
          <Link href={`/plans/${plan.id}`} key={plan.id}>
            <PlanCard plan={plan} />
          </Link>
        ))}
      </VStack>
    </ScrollView>
  );
}
