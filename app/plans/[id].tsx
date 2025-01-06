import React from "react";
import PlanView from "@/components/views/plan-view";
import { useLocalSearchParams } from "expo-router";
import { usePlanQuery } from "@/hooks/queries/plans";
import { Text } from "~/components/ui/text";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";

export default function PlanScreen() {
  const { id } = useLocalSearchParams();

  const {
    data: plan,
    isLoading,
    error,
  } = usePlanQuery({
    variables: { id: Number(id) },
  });

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <SafeAreaProvider>
      <SafeAreaView>
        <ScrollView>
          <Padding>
            {plan ? <PlanView plan={plan} /> : <Text>Plan not found</Text>}
          </Padding>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
