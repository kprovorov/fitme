import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { useWorkoutPlansQuery } from "~/hooks/queries/workout-plans";
import { Text } from "~/components/ui/text";
import WorkoutPlanView from "~/components/views/workout-plan-view";
import { useState, useEffect } from "react";
import { WorkoutPlan } from "~/lib/models";
import { router } from "expo-router";

export default function HomeScreen() {
  const { data: plans, isLoading, error } = useWorkoutPlansQuery();

  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);

  useEffect(() => {
    if (plans) {
      setActivePlan(plans.find((plan) => plan.is_active) || null);
    }
  }, [plans]);

  useEffect(() => {
    if (!activePlan) {
      router.push("/onboarding");
    }
  }, [activePlan]);

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <SafeAreaProvider>
      <SafeAreaView>
        {!!activePlan && (
          <ScrollView>
            <Padding>
              <WorkoutPlanView plan={activePlan} />
            </Padding>
          </ScrollView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
