import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePlansQuery } from "~/hooks/queries/plans";
import { Text } from "~/components/ui/text";
import { useState, useEffect, useCallback } from "react";
import { Plan } from "~/lib/models";
import { Button } from "~/components/ui/button";
import { Link } from "expo-router";
import { VStack } from "~/components/ui/vstack";
import { H1 } from "~/components/ui/typography";
import Purchases from "react-native-purchases";
import HomeView from "~/components/views/home-view";

export default function HomeScreen() {
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: plans, refetch: refetchWorkoutPlans } = usePlansQuery({
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ paddingBottom: 64 }}>
          <HomeView plan={activePlan} />
        </View>
      </ScrollView>
    </SafeAreaView>
  ) : (
    <VStack className="h-full p-6">
      <H1 className="text-center">Create your first workout plan</H1>
      <Text className="text-center">
        You don&apos;t have an active workout plan. Please create one to start
        your journey.
      </Text>
      <Link href="/onboarding/profile" asChild>
        <Button className="w-full">
          <Text>Start your workout plan</Text>
        </Button>
      </Link>
    </VStack>
  );
}
