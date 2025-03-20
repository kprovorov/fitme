import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { useWorkoutPlansQuery } from "~/hooks/queries/workout-plans";
import { Text } from "~/components/ui/text";
import WorkoutPlanView from "~/components/views/workout-plan-view";
import { useState, useEffect } from "react";
import { WorkoutPlan } from "~/lib/models";
import { Button } from "~/components/ui/button";
import { Link } from "expo-router";
import { VStack } from "~/components/ui/vstack";
import { H1 } from "~/components/ui/typography";

export default function HomeScreen() {
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);

  const {
    data: plans,
    isLoading,
    error,
  } = useWorkoutPlansQuery({
    refetchInterval: 1000 * 60, // 1 minute
  });

  useEffect(() => {
    if (plans) {
      setActivePlan(plans.find((plan) => plan.is_active) || null);
    }
  }, [plans]);

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1">
        {activePlan ? (
          <ScrollView>
            <Padding>
              <WorkoutPlanView plan={activePlan} />
            </Padding>
          </ScrollView>
        ) : (
          <VStack className="h-full p-6">
            <H1 className="text-center">Create your first workout plan</H1>
            <Text className="text-center">
              You don't have an active workout plan. Please create one to start
              your journey.
            </Text>
            <Link href="/onboarding/profile" asChild>
              <Button className="w-full">
                <Text>Start your workout plan</Text>
              </Button>
            </Link>
          </VStack>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
