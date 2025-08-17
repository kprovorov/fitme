import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { H1, H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import WorkoutsSessionsListView from "~/components/views/workout-session-list-view";
import { useWorkoutSessionHistoryQuery } from "~/hooks/queries/workout-sessions";
import { Text } from "~/components/ui/text";
import { Link } from "expo-router";
import { Button } from "~/components/ui/button";
import Purchases from "react-native-purchases";

export default function HistoryScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data: workoutSessions, refetch: refetchWorkoutSessions } =
    useWorkoutSessionHistoryQuery();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Purchases.invalidateCustomerInfoCache();
    await refetchWorkoutSessions();
    setRefreshing(false);
  }, [refetchWorkoutSessions]);

  return (
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
          <VStack className="items-stretch flex-1">
            <H3>Finished workouts</H3>
            {workoutSessions?.length ? (
              <WorkoutsSessionsListView workoutsSessions={workoutSessions} />
            ) : (
              <VStack className="h-full p-6">
                <H1 className="text-center">Create your first workout plan</H1>
                <Text className="text-center">
                  You don&apos;t have an active workout plan. Please create one
                  to start your journey.
                </Text>
                <Link href="/onboarding/profile" asChild>
                  <Button className="w-full">
                    <Text>Start your workout plan</Text>
                  </Button>
                </Link>
              </VStack>
            )}
          </VStack>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
