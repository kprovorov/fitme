import React from "react";
import PlannerForm from "../forms/planner/planner-form";
import { ScrollView, View } from "react-native";
import { useStoreProfileMutation } from "@/hooks/queries/profiles";
import { H1, H3 } from "~/components/ui/typography";

export default function PlannerView() {
  const { mutate: storeProfile } = useStoreProfileMutation();

  return (
    <ScrollView>
      <View className="flex flex-col gap-4 p-4">
        <H1>Welcome to Fitme! Your AI fitness coach</H1>
        <H3>Let's get started by answering a few questions about yourself.</H3>
        <PlannerForm onSubmit={storeProfile} />
      </View>
    </ScrollView>
  );
}
