import React from "react";
import PlannerForm from "../forms/planner/planner-form";
import { useStoreProfileMutation } from "@/hooks/queries/profiles";
import { H1, H3, Muted, P } from "~/components/ui/typography";
import { VStack } from "../ui/vstack";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

export default function PlannerView() {
  const queryClient = useQueryClient();

  const { mutateAsync: storeProfile, isPending } = useStoreProfileMutation({
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      router.push(`/plans/${res.id}`);
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
          await storeProfile(values);
        }}
      />
      {isPending && (
        <VStack className="gap-0">
          <P className="font-bold">
            Hold on... AI is working hard to create your plan!
          </P>
          <Muted>This may take a couple of minutes.</Muted>
        </VStack>
      )}
    </VStack>
  );
}
