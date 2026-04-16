import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import Purchases from "react-native-purchases";
import { Text } from "~/components/ui/text";
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
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Finished workouts",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <ScrollView
        className="px-6"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
        showsVerticalScrollIndicator={false}
      >
        {workoutSessions?.length ? (
          <WorkoutsSessionsListView workoutsSessions={workoutSessions} />
        ) : (
          <VStack className="h-full p-6">
            <Text className="text-center">
              You don't have any finished workouts yet.
            </Text>
          </VStack>
        )}
      </ScrollView>
    </>
  );
}
