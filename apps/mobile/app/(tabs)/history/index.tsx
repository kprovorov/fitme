import type { WorkoutSession } from "@fitme/core";
import { Link, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import Purchases from "react-native-purchases";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import WorkoutSessionCard from "~/components/views/workout-session-card";
import { useWorkoutSessionHistoryQuery } from "~/hooks/queries/workout-sessions";

const ItemSeparator = () => <View className="h-4" />;

const keyExtractor = (item: WorkoutSession) => item.id;

// `asChild` keeps the card out of the Text wrapper Link renders by default,
// which clips the top edge of an inlined View.
const renderItem = ({ item }: { item: WorkoutSession }) => (
  <Link asChild href={`/workout-sessions/${item.id}/summary`}>
    <Pressable className="active:opacity-80">
      <WorkoutSessionCard className="w-full" workoutSession={item} />
    </Pressable>
  </Link>
);

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
          headerBackButtonDisplayMode: "minimal",
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: "Finished workouts",
        }}
      />

      <FlatList
        className="px-6"
        contentInsetAdjustmentBehavior="automatic"
        data={workoutSessions ?? []}
        ItemSeparatorComponent={ItemSeparator}
        keyExtractor={keyExtractor}
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
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}
