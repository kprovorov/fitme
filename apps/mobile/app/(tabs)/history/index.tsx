import type { WorkoutSession } from "@fitme/core";
import { LegendList } from "@legendapp/list/react-native";
import { format } from "date-fns";
import { Link, Stack, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import Purchases from "react-native-purchases";
import { useResolveClassNames } from "uniwind";
import { Button } from "~/components/ui/button";
import { MenuList } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H1 } from "~/components/ui/typography";
import WorkoutSessionHistoryRow from "~/components/views/workout-session-history-row";
import { useWorkoutSessionHistoryQuery } from "~/hooks/queries/workout-sessions";

interface Month {
  key: string;
  sessions: WorkoutSession[];
  title: string;
}

/** Sessions grouped by the month they started in, newest first. */
function groupByMonth(sessions: WorkoutSession[]): Month[] {
  // Sorted by start, the date grouped on: the query orders by finish, and a
  // long session finished late would otherwise split its month in two.
  const byStart = [...sessions].sort(
    (a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
  const months: Month[] = [];
  for (const session of byStart) {
    const startedAt = new Date(session.started_at);
    const key = format(startedAt, "yyyy-MM");
    const last = months.at(-1);
    if (last?.key === key) {
      last.sessions.push(session);
    } else {
      months.push({
        key,
        sessions: [session],
        title: format(startedAt, "LLLL yyyy"),
      });
    }
  }
  return months;
}

const keyExtractor = (month: Month) => month.key;

const renderMonth = ({ item }: { item: Month }) => (
  <MonthSection month={item} />
);

function MonthSection({ month }: { month: Month }) {
  return (
    <View className="gap-xs pb-md">
      <View className="flex-row items-baseline gap-2 px-1">
        <Text
          accessibilityRole="header"
          className="flex-1 font-nunito-sans-bold text-subhead"
        >
          {month.title}
        </Text>
        <Text className="text-footnote text-muted-foreground">
          {month.sessions.length === 1
            ? "1 workout"
            : `${month.sessions.length} workouts`}
        </Text>
      </View>
      <MenuList>
        {month.sessions.map((session, index) => (
          <View key={session.id}>
            {index > 0 && <Separator className="ml-sm" />}
            {/* `asChild` keeps the row out of the Text wrapper Link renders by default. */}
            <Link asChild href={`/workout-sessions/${session.id}/summary`}>
              <Pressable
                accessibilityRole="button"
                className="active:opacity-80"
              >
                <WorkoutSessionHistoryRow workoutSession={session} />
              </Pressable>
            </Link>
          </View>
        ))}
      </MenuList>
    </View>
  );
}

function EmptyHistory() {
  const router = useRouter();
  const goHome = useCallback(() => router.navigate("/"), [router]);
  return (
    <View className="flex-1 items-center justify-center gap-sm px-md pt-lg">
      <H1 className="text-center">No workouts yet</H1>
      <Text className="text-center text-muted-foreground">
        Finished workouts show up here, with how long they took and what you
        lifted.
      </Text>
      <Button
        fill={false}
        label="Start a Workout"
        onPress={goHome}
        shape="pill"
      />
    </View>
  );
}

export default function HistoryScreen() {
  const [refreshing, setRefreshing] = useState(false);
  // LegendList takes no class names: resolve the spacing tokens to a style.
  const contentContainerStyle = useResolveClassNames("px-sm pt-xs pb-lg");

  const {
    data: workoutSessions,
    isError,
    refetch: refetchWorkoutSessions,
  } = useWorkoutSessionHistoryQuery();

  const months = useMemo(
    () => groupByMonth(workoutSessions ?? []),
    [workoutSessions]
  );

  const retry = useCallback(() => {
    refetchWorkoutSessions();
  }, [refetchWorkoutSessions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Purchases.invalidateCustomerInfoCache();
      await refetchWorkoutSessions();
    } finally {
      setRefreshing(false);
    }
  }, [refetchWorkoutSessions]);

  const renderEmpty = () => {
    if (isError) {
      return (
        <View className="items-center gap-sm px-md pt-lg">
          <Text className="text-center text-muted-foreground">
            Couldn't load your workouts. Check your connection and try again.
          </Text>
          <Button
            fill={false}
            label="Try Again"
            onPress={retry}
            shape="pill"
            variant="secondary"
          />
        </View>
      );
    }
    if (!workoutSessions) {
      return (
        <View className="items-center pt-lg">
          <ActivityIndicator colorClassName="accent-foreground" />
        </View>
      );
    }
    return <EmptyHistory />;
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerLargeTitleStyle: { fontFamily: "NunitoSans12pt-Bold" },
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: "History",
        }}
      />

      <LegendList
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
        data={months}
        keyExtractor={keyExtractor}
        ListEmptyComponent={renderEmpty()}
        recycleItems={false}
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
        renderItem={renderMonth}
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}
