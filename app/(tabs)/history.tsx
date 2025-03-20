import React, { useEffect, useState } from "react";
import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { H1, H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import WorkoutsListView from "~/components/views/workouts-list-view";
import { useWorkoutPlansQuery } from "~/hooks/queries/workout-plans";
import { WorkoutPlan } from "~/lib/models";
import { Text } from "~/components/ui/text";
import { Link } from "expo-router";
import { Button } from "~/components/ui/button";

export default function HistoryScreen() {
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);

  const { data: plans } = useWorkoutPlansQuery({
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
        <ScrollView className="h-full p-6">
          <VStack className="items-stretch">
            <H3>Finished workouts</H3>
            {activePlan ? (
              <WorkoutsListView
                workouts={activePlan.workouts.filter(
                  (workout) => workout.finished_at
                )}
              />
            ) : (
              <VStack className="h-full p-6">
                <H1 className="text-center">Create your first workout plan</H1>
                <Text className="text-center">
                  You don't have an active workout plan. Please create one to
                  start your journey.
                </Text>
                <Link href="/onboarding/profile" asChild>
                  <Button className="w-full">
                    <Text>Start your workout plan</Text>
                  </Button>
                </Link>
              </VStack>
            )}
          </VStack>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
