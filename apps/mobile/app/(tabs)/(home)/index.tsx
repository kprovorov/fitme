import { useUser } from "@clerk/expo";
import type { Plan } from "@fitme/core";
import { Stack, useRouter } from "expo-router";
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
import { useProfileQuery } from "~/hooks/queries/profiles";
import { storage } from "~/lib/mmkv";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

import HomeView from "~/components/views/home-view";

export default function HomeScreen() {
  const { user } = useUser();
  const { data: profile } = useProfileQuery();
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

  useEffect(() => {
    // `null` means the Profile loaded and there is none; `undefined` means it
    // has not loaded (or failed), so do not send the User to onboarding yet.
    if (user && profile === null) {
      const hasSeen = storage.getBoolean(`onboarding.seen.${user.id}`) ?? false;
      if (!hasSeen) {
        router.push("/onboarding");
      }
    }
  }, [profile, user, router]);

  const handleCreatePlan = useCallback(() => router.push("/planner"), [router]);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: "Home",
          unstable_headerRightItems: () => [
            {
              icon: {
                name: "ellipsis",
                type: "sfSymbol",
              },
              label: "Manage Plans",
              menu: {
                items: [
                  {
                    icon: {
                      name: "slider.horizontal.3",
                      type: "sfSymbol",
                    },
                    label: "Manage Plans",
                    onPress: () => {
                      router.push("/plans");
                    },
                    type: "action",
                  },
                  {
                    icon: {
                      name: "plus",
                      type: "sfSymbol",
                    },
                    label: "Create Plan",
                    onPress: () => {
                      router.push("/planner");
                    },
                    type: "action",
                  },
                ],
              },
              type: "menu",
            },
          ],
        }}
      />
      <ScrollView
        contentContainerClassName="grow px-md pb-md"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
        showsVerticalScrollIndicator={false}
      >
        {activePlan ? (
          <HomeView plan={activePlan} />
        ) : // biome-ignore lint/suspicious/noUnnecessaryConditions: false positive, Biome resolves react-query-kit's initialData overload, where isLoading is always false
        isLoadingPlans ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#ffffff" size="large" />
          </View>
        ) : (
          <VStack className="flex-1 py-md">
            <H1 className="text-center">No active plan</H1>
            <Text className="text-center">
              You don&apos;t have an active workout plan. Create one to get
              started.
            </Text>
            <Button className="w-full" onPress={handleCreatePlan}>
              <Text>Create Workout Plan</Text>
            </Button>
          </VStack>
        )}
      </ScrollView>
    </>
  );
}
