import React from "react";
import PlannerForm from "../forms/planner/planner-form";
import { useStoreProfileMutation } from "@/hooks/queries/profiles";
import { H1, H3 } from "~/components/ui/typography";
import { VStack } from "../ui/vstack";

export default function PlannerView() {
  const { mutate: storeProfile } = useStoreProfileMutation();

  return (
    <VStack className="items-stretch">
      <H1>Welcome to Fitme! Your AI fitness coach</H1>
      <H3>Let's get started by answering a few questions about yourself.</H3>
      <PlannerForm onSubmit={storeProfile} />
    </VStack>
  );
}
