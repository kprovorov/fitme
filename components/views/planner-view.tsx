import React from "react";
import PlannerForm from "../forms/planner/planner-form";
import { useStoreProfileMutation } from "@/hooks/queries/profiles";
import { H1, H3, P } from "~/components/ui/typography";
import { VStack } from "../ui/vstack";

export default function PlannerView() {
  const { mutate: storeProfile } = useStoreProfileMutation();

  return (
    <VStack className="items-stretch gap-8 h-full">
      <VStack>
        <H1>Welcome to Fitme!</H1>
        <H3>Your AI fitness coach</H3>
      </VStack>
      <PlannerForm onSubmit={storeProfile} />
    </VStack>
  );
}
