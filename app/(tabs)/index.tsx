import { RefreshControl, ScrollView, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { useWorkoutPlansQuery } from "~/hooks/queries/workout-plans";
import { Text } from "~/components/ui/text";
import WorkoutPlanView from "~/components/views/workout-plan-view";
import { useState, useEffect, useCallback } from "react";
import { WorkoutPlan } from "~/lib/models";
import { Button } from "~/components/ui/button";
import { Link } from "expo-router";
import { VStack } from "~/components/ui/vstack";
import { H1 } from "~/components/ui/typography";
import Purchases from "react-native-purchases";

export default function HomeScreen() {
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: plans, refetch: refetchWorkoutPlans } = useWorkoutPlansQuery({
    refetchInterval: 1000 * 60, // 1 minute
  });

  useEffect(() => {
    if (plans) {
      setActivePlan(plans.find((plan) => plan.is_active) || null);
    }
  }, [plans]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Purchases.invalidateCustomerInfoCache();
    await refetchWorkoutPlans();
    setRefreshing(false);
  }, []);

  return activePlan ? (
    <SafeAreaView
      edges={["top"]}
      style={{
        paddingBottom: 64,
      }}
      className="flex-1"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="p-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ paddingBottom: 64 }}>
          <WorkoutPlanView plan={activePlan} />
        </View>
      </ScrollView>
    </SafeAreaView>
  ) : (
    <VStack className="h-full p-6">
      <H1 className="text-center">Create your first workout plan</H1>
      <Text className="text-center">
        You don't have an active workout plan. Please create one to start your
        journey.
      </Text>
      <Link href="/onboarding/profile" asChild>
        <Button className="w-full">
          <Text>Start your workout plan</Text>
        </Button>
      </Link>
    </VStack>
  );
}
