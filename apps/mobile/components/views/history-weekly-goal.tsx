import type { GoalWeek, WeeklyGoalOverview } from "@fitme/core";
import { formatCount, formatDate, type Translator } from "@fitme/i18n";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "~/components/ui/text";
import { useStackedLayout } from "~/hooks/stacked-layout";
import { useI18n } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/** How a week's goal stands, said in words (the chart's colors aren't enough). */
const status = (t: TFunction, week: GoalWeek): string => {
  if (week.hit) {
    return t("history.weeklyGoal.goalMet");
  }
  if (week.current) {
    return t("history.weeklyGoal.inProgress");
  }
  // A first partial week's miss is never held against the User
  return week.kind === "firstPartial"
    ? t("history.weeklyGoal.firstWeek")
    : t("history.weeklyGoal.goalMissed");
};

/** What VoiceOver reads for a week: its count, goal, extras and status. */
const weekLabel = (t: TFunction, i18n: Translator, week: GoalWeek) => {
  const name = week.current
    ? t("history.weeklyGoal.thisWeek")
    : t("history.weeklyGoal.weekOf", {
        date: formatDate(i18n, week.start, "dayMonth"),
      });
  const details =
    week.goal === null
      ? [
          formatCount(i18n, "workouts", week.count),
          t("history.weeklyGoal.noGoal"),
        ]
      : [
          t("history.weeklyGoal.progress", {
            count: week.goal,
            done: Math.min(week.count, week.goal),
          }),
          ...(week.count > week.goal
            ? [
                t("history.weeklyGoal.overGoal", {
                  count: week.count - week.goal,
                }),
              ]
            : []),
          status(t, week),
        ];
  return t("history.weeklyGoal.weekLabel", {
    details: details.join(", "),
    week: name,
  });
};

/**
 * One week's column (Figma's ConsistencyWeek): a pip per workout of its goal,
 * filled bottom up and capped at the goal, `+N` above for the extras. A week
 * without a known goal shows its count in neutral pips, nothing to fill.
 */
function WeekColumn({ pips, week }: { pips: number; week: GoalWeek }) {
  const { t } = useTranslation();
  const i18n = useI18n();
  const slots = week.goal ?? Math.min(week.count, pips);
  const filled = Math.min(week.count, slots);
  const extra = week.count - slots;
  return (
    <View
      accessibilityLabel={weekLabel(t, i18n, week)}
      accessible
      className="min-w-9 items-center gap-xs"
    >
      <View className="w-9 flex-1 justify-end gap-1">
        {extra > 0 && (
          <Text
            className={cn(
              "text-center text-caption-2-emphasized",
              week.goal === null ? "text-muted-foreground" : "text-primary"
            )}
          >
            {t("history.weeklyGoal.extra", { count: extra })}
          </Text>
        )}
        {Array.from({ length: slots }, (_, index) => slots - index).map(
          (pip) => (
            <View
              className={cn(
                "h-2 rounded-full",
                week.goal === null && "bg-muted-foreground",
                week.goal !== null &&
                  (pip <= filled ? "bg-primary" : "bg-secondary")
              )}
              key={pip}
            />
          )
        )}
      </View>
      <Text className="text-caption-2 text-muted-foreground">
        {week.current
          ? t("history.weeklyGoal.now")
          : formatDate(i18n, week.start, "shortDayMonth")}
      </Text>
    </View>
  );
}

/**
 * The Weekly goal under the month's totals: the goal, the weeks hit among the
 * completed, fully tracked ones (hidden until there is one) and the
 * eight-week chart. Informational: nothing in it is tappable.
 */
export default function HistoryWeeklyGoal({
  overview,
}: {
  overview: WeeklyGoalOverview;
}) {
  const { t } = useTranslation();
  const i18n = useI18n();
  const stacked = useStackedLayout();
  // Columns as tall as the biggest goal on show, so every pip is one size.
  const pips = Math.max(...overview.weeks.map((week) => week.goal ?? 0), 1);

  return (
    <View className="gap-sm">
      <View
        className={
          stacked ? "gap-1" : "flex-row items-center justify-between gap-sm"
        }
      >
        <Text className="text-footnote text-muted-foreground">
          {t("history.weeklyGoal.title", {
            workouts: formatCount(i18n, "workouts", overview.goal),
          })}
        </Text>
        {overview.eligibleWeeks > 0 && (
          <Text className="text-footnote-emphasized text-primary">
            {t("history.weeklyGoal.weeksHit", {
              count: overview.eligibleWeeks,
              hit: overview.hitWeeks,
            })}
          </Text>
        )}
      </View>
      <View
        className={
          stacked
            ? "flex-row flex-wrap justify-start gap-sm"
            : "flex-row justify-between"
        }
      >
        {overview.weeks.map((week) => (
          <WeekColumn key={week.start.toISOString()} pips={pips} week={week} />
        ))}
      </View>
    </View>
  );
}
