import { formatCount, formatDate, type Translator } from "@fitme/i18n";
import { LegendList } from "@legendapp/list/react-native";
import { Stack, useRouter } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import Purchases from "react-native-purchases";
import { useResolveClassNames } from "uniwind";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H1, H4 } from "~/components/ui/typography";
import HistoryMonthOverview from "~/components/views/history-month-overview";
import WorkoutSessionHistoryRow from "~/components/views/workout-session-history-row";
import {
  useWorkoutSessionHistoryQuery,
  type WorkoutSessionHistory,
  type WorkoutSessionHistoryEntry,
} from "~/hooks/queries/workout-sessions";
import { useStackedLayout } from "~/hooks/stacked-layout";
import { useI18n } from "~/lib/i18n";

interface Month {
  entries: WorkoutSessionHistoryEntry[];
  key: string;
  title: string;
  weightUnit: WorkoutSessionHistory["weightUnit"];
}

/**
 * Entries grouped by the month they started in on the device's clock,
 * newest first (the query sorts them by start).
 */
function groupByMonth(
  { sessions, weightUnit }: WorkoutSessionHistory,
  translator: Translator
): Month[] {
  const months: Month[] = [];
  for (const entry of sessions) {
    const startedAt = new Date(entry.started_at);
    const key = `${startedAt.getFullYear()}-${startedAt.getMonth() + 1}`;
    const last = months.at(-1);
    if (last?.key === key) {
      last.entries.push(entry);
    } else {
      months.push({
        entries: [entry],
        key,
        title: formatDate(translator, startedAt, "monthYear"),
        weightUnit,
      });
    }
  }
  return months;
}

const keyExtractor = (month: Month) => month.key;

const renderMonth = ({ item }: { item: Month }) => (
  <MonthSection month={item} />
);

/**
 * A month of History: its heading, counting every finished entry (empty
 * completions too, unlike the overview's workouts), over a card of rows.
 */
function MonthSection({ month }: { month: Month }) {
  const i18n = useI18n();
  const stacked = useStackedLayout();
  return (
    <View className="gap-xs pb-lg">
      <View
        className={
          stacked ? "gap-1 px-1" : "flex-row items-baseline gap-2 px-1"
        }
      >
        <H4 className={stacked ? undefined : "flex-1"}>{month.title}</H4>
        <Text className="text-footnote text-muted-foreground">
          {formatCount(i18n, "entries", month.entries.length)}
        </Text>
      </View>
      <Card className="gap-sm">
        {month.entries.map((entry, index) => (
          <Fragment key={entry.id}>
            {index > 0 && <Separator />}
            <WorkoutSessionHistoryRow
              entry={entry}
              weightUnit={month.weightUnit}
            />
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

function EmptyHistory() {
  const router = useRouter();
  const goHome = useCallback(() => router.navigate("/"), [router]);
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-sm px-md pt-lg">
      <H1 className="text-center">{t("history.empty.title")}</H1>
      <Text className="text-center text-muted-foreground">
        {t("history.empty.body")}
      </Text>
      <Button fill={false} label={t("history.empty.start")} onPress={goHome} />
    </View>
  );
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  // LegendList takes no class names: resolve the spacing tokens to a style.
  const contentContainerStyle = useResolveClassNames("px-sm pt-sm pb-lg");

  const {
    data: history,
    isError,
    refetch: refetchWorkoutSessions,
  } = useWorkoutSessionHistoryQuery();

  // Grouped on every render, not memoized: `useI18n()` re-renders the screen
  // when the App language (or the device's region) changes, and the month
  // titles follow it.
  const i18n = useI18n();
  const months = history ? groupByMonth(history, i18n) : [];

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
            {t("history.loadError")}
          </Text>
          <Button
            fill={false}
            label={t("common.tryAgain")}
            onPress={retry}
            variant="secondary"
          />
        </View>
      );
    }
    if (!history) {
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
          title: t("tabs.history"),
        }}
      />

      <LegendList
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
        data={months}
        keyExtractor={keyExtractor}
        ListEmptyComponent={renderEmpty()}
        ListHeaderComponent={
          history && history.sessions.length > 0 ? (
            <HistoryMonthOverview history={history} />
          ) : null
        }
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
