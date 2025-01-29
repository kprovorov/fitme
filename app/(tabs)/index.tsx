import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { useWorkoutPlansQuery } from "~/hooks/queries/workout-plans";
import PlannerView from "~/components/views/planner-view";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import WorkoutPlanView from "~/components/views/workout-plan-view";
import { useEffect } from "react";
import { useState } from "react";
import { WorkoutPlan } from "~/lib/models";

export default function HomeScreen() {
  const { data: plans, isLoading, error } = useWorkoutPlansQuery();

  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);

  useEffect(() => {
    if (plans) {
      setActivePlan(plans.find((plan) => plan.is_active) || null);
    }
  }, [plans]);

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <SafeAreaProvider>
      <SafeAreaView>
        {activePlan ? (
          <ScrollView>
            <Padding>
              <WorkoutPlanView plan={activePlan} />
            </Padding>
          </ScrollView>
        ) : (
          <VStack className="h-full p-4">
            <PlannerView />
          </VStack>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
