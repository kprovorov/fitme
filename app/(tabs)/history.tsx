import { Link } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import Purchases from "react-native-purchases";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H1, H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import WorkoutsSessionsListView from "~/components/views/workout-session-list-view";
import { useWorkoutSessionHistoryQuery } from "~/hooks/queries/workout-sessions";

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
      className="flex-1"
      edges={["top"]}
      style={{
        paddingBottom: 64,
      }}
    >
      <ScrollView
        className="p-6"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
      >
        <View style={{ paddingBottom: 64 }}>
          <VStack className="flex-1 items-stretch">
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
                <Link asChild href="/onboarding/profile">
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
