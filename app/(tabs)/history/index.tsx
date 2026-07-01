import { Link, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import Purchases from "react-native-purchases";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import WorkoutSessionCard from "~/components/views/workout-session-card";
import { useWorkoutSessionHistoryQuery } from "~/hooks/queries/workout-sessions";
import type { WorkoutSession } from "~/lib/models";

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

      <FlatList
        className="px-6"
        contentInsetAdjustmentBehavior="automatic"
        data={workoutSessions ?? []}
        ItemSeparatorComponent={() => <View className="h-4" />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <VStack className="flex-1 items-center justify-center p-6">
            <Text className="text-center">
              You don't have any finished workouts yet.
            </Text>
          </VStack>
        }
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
        renderItem={({ item }: { item: WorkoutSession }) => (
          <Link href={`/workout-sessions/${item.id}/summary`}>
            <WorkoutSessionCard className="w-full" workoutSession={item} />
          </Link>
        )}
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}
