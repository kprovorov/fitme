import { monthlyTotals, weeklyGoalOverview } from "@fitme/core";
import {
  formatCompactVolume,
  formatCount,
  formatDuration,
  formatNumber,
  spokenCompactVolume,
} from "@fitme/i18n";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import HistoryWeeklyGoal from "~/components/views/history-weekly-goal";
import type { WeeklyGoals } from "~/hooks/queries/weekly-goals";
import type { WorkoutSessionHistory } from "~/hooks/queries/workout-sessions";
import { useStackedLayout } from "~/hooks/stacked-layout";
import { useI18n } from "~/lib/i18n";
import { cn } from "~/lib/utils";

interface StatProps {
  accent?: boolean;
  /** What VoiceOver reads for the value: `3 workouts`, `136.2 tonnes`. */
  spokenValue: string;
  /** One under another (large text) rather than side by side. */
  stacked: boolean;
  title: string;
  value: string;
}

/** One summary figure: a large value over its caption (Figma's StatItem). */
function Stat({
  accent = false,
  spokenValue,
  stacked,
  title,
  value,
}: StatProps) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t("history.statLabel", { title, value: spokenValue })}
      accessible
      className={stacked ? "gap-0.5" : "flex-1 gap-0.5"}
    >
      <Text
        className={cn(
          "text-title-2-emphasized",
          accent ? "text-primary" : "text-foreground"
        )}
      >
        {value}
      </Text>
      <Text className="text-footnote text-muted-foreground">{title}</Text>
    </View>
  );
}

/**
 * The current calendar month's training, above History's list: qualifying
 * Workout Sessions, their full elapsed time and their volume. Always this
 * month, whatever the list shows, and zeros when it has none. Under it the
 * Weekly goal chart, with an active Plan only (`weeklyGoals` unread or
 * failed: none).
 */
export default function HistoryMonthOverview({
  history,
  weeklyGoals,
}: {
  history: WorkoutSessionHistory;
  weeklyGoals: WeeklyGoals | undefined;
}) {
  const i18n = useI18n();
  const { t } = useTranslation();
  const totals = monthlyTotals(history.sessions);
  const time = formatDuration(i18n, totals.elapsedMs);
  const stacked = useStackedLayout();
  const goalOverview = weeklyGoals
    ? weeklyGoalOverview(weeklyGoals.changes, history.sessions)
    : null;

  return (
    <View className="gap-sm px-1 pb-lg">
      <View
        className={
          stacked
            ? "items-start gap-xs"
            : "flex-row flex-wrap items-center justify-between gap-xs"
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
      <View className={stacked ? "gap-sm" : "flex-row gap-sm"}>
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
}
