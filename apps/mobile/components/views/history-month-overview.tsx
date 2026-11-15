import { monthlyTotals, weeklyGoalOverview } from "@fitme/core";
import {
  formatCompactVolume,
  formatCount,
  formatDuration,
  formatNumber,
  spokenCompactVolume,
} from "@fitme/i18n";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { StatItem } from "~/components/stat-item";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import HistoryWeeklyGoal from "~/components/views/history-weekly-goal";
import type { WeeklyGoals } from "~/hooks/queries/weekly-goals";
import type { WorkoutSessionHistory } from "~/hooks/queries/workout-sessions";
import { useStackedLayout } from "~/hooks/stacked-layout";
import { useI18n } from "~/lib/i18n";

/** One of this month's figures, read as `Workouts: 3 workouts`. */
const Stat = ({
  spokenValue,
  title,
  ...props
}: Omit<ComponentProps<typeof StatItem>, "accessibilityLabel"> & {
  /** What VoiceOver reads for the value: `3 workouts`, `136.2 tonnes`. */
  spokenValue: string;
}) => {
  const { t } = useTranslation();

  return (
    <StatItem
      {...props}
      accessibilityLabel={t("history.statLabel", { title, value: spokenValue })}
      title={title}
    />
  );
};

/**
 * The current calendar month's training, above History's list: qualifying
 * Workout Sessions, their full elapsed time and their volume. Always this
 * month, whatever the list shows, and zeros when it has none. Under it the
 * Weekly goal chart, with an active Plan only (`weeklyGoals` unread or
 * failed: none).
 */
const HistoryMonthOverview = ({
  history,
  weeklyGoals,
}: {
  history: WorkoutSessionHistory;
  weeklyGoals: WeeklyGoals | undefined;
}) => {
  const i18n = useI18n();
  const { t } = useTranslation();
  const totals = monthlyTotals(history.sessions);
  const time = formatDuration(i18n, totals.elapsedMs);
  const stacked = useStackedLayout();

  const goalOverview = weeklyGoals
    ? weeklyGoalOverview(weeklyGoals.changes, history.sessions)
    : null;

  return (
    <View className="gap-sm pb-lg px-1">
      <View
        className={
          stacked
            ? "gap-xs items-start"
            : "gap-xs flex-row flex-wrap items-center justify-between"
        }
      >
        <H4>{t("history.thisMonth")}</H4>
        {goalOverview && (weeklyGoals?.streak ?? 0) > 0 ? (
          <Badge
            accessibilityLabel={t("history.streak.spoken", {
              count: weeklyGoals?.streak,
            })}
            accessible
            className="max-w-full"
            icon="flame.fill"
          >
            <Text className="shrink">
              {t("history.streak.badge", { count: weeklyGoals?.streak })}
            </Text>
          </Badge>
        ) : null}
      </View>
      <View className={stacked ? "gap-sm" : "gap-sm flex-row"}>
        <Stat
          accent
          spokenValue={formatCount(i18n, "workouts", totals.workouts)}
          stacked={stacked}
          title={t("history.stats.workouts")}
          value={formatNumber(i18n, totals.workouts)}
        />
        <Stat
          spokenValue={time}
          stacked={stacked}
          title={t("history.stats.time")}
          value={time}
        />
        <Stat
          spokenValue={spokenCompactVolume(
            i18n,
            totals.volume,
            history.weightUnit
          )}
          stacked={stacked}
          title={t("history.stats.volume")}
          value={formatCompactVolume(i18n, totals.volume, history.weightUnit)}
        />
      </View>
      {goalOverview ? (
        <>
          <Separator />
          <HistoryWeeklyGoal overview={goalOverview} />
        </>
      ) : null}
    </View>
  );
};

export default HistoryMonthOverview;
