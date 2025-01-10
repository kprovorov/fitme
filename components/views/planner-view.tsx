import React from "react";
import PlannerForm from "../forms/planner/planner-form";
import { useStoreProfileMutation } from "@/hooks/queries/profiles";
import { H1, H3, Muted, P } from "~/components/ui/typography";
import { VStack } from "../ui/vstack";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useStoreWorkoutPlanMutation } from "~/hooks/mutations/workout-plans";

export default function PlannerView() {
  const queryClient = useQueryClient();

  const { mutateAsync: storeProfile, isPending } = useStoreProfileMutation();

  const { mutateAsync: storeWorkoutPlan, isPending: isWorkoutPlanPending } =
    useStoreWorkoutPlanMutation({
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
        router.push(`/workout-plans/${res.id}`);
      },
    });

  return (
    <VStack className="items-stretch gap-8 h-full">
      <VStack>
        <H1>Welcome to Fitme!</H1>
        <H3>Your AI fitness coach</H3>
      </VStack>
      <PlannerForm
        onSubmit={async (values) => {
          await storeProfile({
            gender: values.gender,
            age: values.age,
            weight: values.weight,
            height: values.height,
          });

          await storeWorkoutPlan({
            goal: values.goal,
            place: values.location,
            frequency: values.frequency,
          });
        }}
      />
      {isPending ||
        (isWorkoutPlanPending && (
          <VStack className="gap-0">
            <P className="font-bold">
              Hold on... AI is working hard to create your plan!
            </P>
            <Muted>This may take a couple of minutes.</Muted>
          </VStack>
        ))}
    </VStack>
  );
}
