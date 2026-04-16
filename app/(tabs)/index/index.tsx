import { Link, Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import Purchases from "react-native-purchases";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H1 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { usePlansQuery } from "~/hooks/queries/plans";
import type { Plan } from "~/lib/models";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

import HomeView from "~/components/views/home-view";

export default function HomeScreen() {
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: plans,
    refetch: refetchWorkoutPlans,
    isLoading: isLoadingPlans,
  } = usePlansQuery({
    refetchInterval: 1000 * 60, // 1 minute
  });

  useEffect(() => {
    if (plans) {
      setActivePlan(plans.find((plan) => plan.is_active) || null);
    }
  }, [plans]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (!IS_E2E) {
      await Purchases.invalidateCustomerInfoCache();
    }
    await refetchWorkoutPlans();
    setRefreshing(false);
  }, [refetchWorkoutPlans]);

  const router = useRouter();

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Home",
          headerBackButtonDisplayMode: "minimal",
          unstable_headerRightItems: () => [
            {
              type: "menu",
              icon: {
                type: "sfSymbol",
                name: "ellipsis",
              },
              labelStyle: {
                fontFamily: "NunitoSans12pt-Regular",
              },
              menu: {
                items: [
                  {
                    type: "action",
                    label: "Manage Plans",

                    icon: {
                      type: "sfSymbol",
                      name: "slider.horizontal.3",
                    },
                    onPress: () => {
                      router.push("/plans");
                    },
                  },
                  {
                    type: "action",
                    label: "Create Plan",
                    icon: {
                      type: "sfSymbol",
                      name: "plus",
                    },
                    onPress: () => {
                      router.push("/planner");
                    },
                  },
                ],
              },
            },
          ],
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
      >
        {activePlan ? (
          <HomeView plan={activePlan} />
        ) : isLoadingPlans ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#ffffff" size="large" />
          </View>
        ) : (
          <VStack className="h-full p-6">
            <H1 className="text-center">Create your first workout plan</H1>
            <Text className="text-center">
              You don&apos;t have an active workout plan. Please create one to
              start your journey.
            </Text>
            <Link asChild href="/onboarding/profile">
              <Button className="w-full">
                <Text>Start your workout plan</Text>
              </Button>
            </Link>
          </VStack>
        )}
      </ScrollView>
    </>
  );
}
