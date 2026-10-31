import {
  formatCount,
  formatDate,
  formatUnit,
  formatWorkoutDuration,
  spokenUnit,
} from "@fitme/i18n";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { Badge } from "~/components/ui/badge";
import { Text } from "~/components/ui/text";
import { useExercises } from "~/hooks/queries/library";
import type {
  WorkoutSessionHistory,
  WorkoutSessionHistoryEntry,
} from "~/hooks/queries/workout-sessions";
import { useStackedLayout } from "~/hooks/stacked-layout";
import { useI18n } from "~/lib/i18n";

/** The row's disclosure indicator. */
const Chevron = () => (
  <SymbolImage
    className="text-body-emphasized text-primary"
    name="chevron.right"
  />
);

interface WorkoutSessionHistoryRowProps {
  entry: WorkoutSessionHistoryEntry;
  weightUnit: WorkoutSessionHistory["weightUnit"];
}

/**
 * A finished Workout Session in History, after Figma's HistoryEntry: a date
 * tile, the Workout's name with a PR badge when it earned a Personal record,
 * how long it took, its logged sets and volume, opening its Workout Summary.
 * VoiceOver reads each record's Exercise and result after the rest.
 */
export default function WorkoutSessionHistoryRow({
  entry,
  weightUnit,
}: WorkoutSessionHistoryRowProps) {
  const i18n = useI18n();
  const { t } = useTranslation();
  const stacked = useStackedLayout();
  const startedAt = new Date(entry.started_at);
  const name = entry.workout?.name ?? t("history.untitledWorkout");
  const duration = entry.finished_at
    ? formatWorkoutDuration(i18n, entry.started_at, entry.finished_at)
    : null;
  const sets = formatCount(i18n, "sets", entry.logged_set_count);
  const details = [
    duration,
    sets,
    formatUnit(i18n, entry.volume, weightUnit),
  ].filter(Boolean);
  const records = entry.personal_records;
  const exercises = useExercises(
    records.map(({ exercise_slug }) => exercise_slug)
  );
  const label = t("history.entry", {
    date: formatDate(i18n, startedAt, "weekdayDayMonth"),
    duration: duration ?? "",
    name,
    sets,
    volume: spokenUnit(i18n, entry.volume, weightUnit),
  });
  const recordResults = records.map((record) => {
    const result = {
      exercise: exercises[record.exercise_slug]?.name ?? record.exercise_slug,
      reps: formatCount(i18n, "reps", record.reps),
    };
    return record.weight === 0
      ? t("history.bodyweightRecordResult", result)
      : t("history.recordResult", {
          ...result,
          weight: spokenUnit(i18n, record.weight, weightUnit),
        });
  });

  const dateTile = (
    <View className="min-h-11 min-w-11 items-center justify-center rounded-xl border-continuous bg-secondary px-1">
      <Text className="text-caption-2-emphasized text-muted-foreground uppercase">
        {formatDate(i18n, startedAt, "weekday")}
      </Text>
      <Text className="text-headline-emphasized">
        {formatDate(i18n, startedAt, "dayOfMonth")}
      </Text>
    </View>
  );

  return (
    <Link asChild href={`/workout-sessions/${entry.id}/summary`}>
      <Pressable
        accessibilityLabel={
          records.length > 0
            ? t("history.entryWithRecords", {
                entry: label,
                records: t("history.personalRecords", {
                  count: records.length,
                  records: recordResults.join("; "),
                }),
              })
            : label
        }
        accessibilityRole="button"
        className={
          stacked
            ? "gap-xs active:opacity-80"
            : "flex-row items-center gap-sm active:opacity-80"
        }
      >
        {stacked ? (
          <View className="flex-row items-center justify-between gap-sm">
            {dateTile}
            <Chevron />
          </View>
        ) : (
          dateTile
        )}
        <View className={stacked ? "gap-0.5" : "flex-1 gap-0.5"}>
          <View className="flex-row flex-wrap items-center gap-xs">
            <Text className="shrink text-body-emphasized">{name}</Text>
            {records.length > 0 ? (
              <Badge icon="trophy.fill">
                <Text>{t("history.personalRecord")}</Text>
              </Badge>
            ) : null}
          </View>
          <Text className="text-footnote text-muted-foreground">
            {details.join(" · ")}
          </Text>
        </View>
        {stacked ? null : <Chevron />}
      </Pressable>
    </Link>
  );
}
