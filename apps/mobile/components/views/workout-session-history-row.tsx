import {
  countLoggedSets,
  formatElapsed,
  loggedExercises,
  sessionVolume,
  type WorkoutSession,
} from "@fitme/core";
import {
  formatCount,
  formatDate,
  formatTime,
  formatWeight,
  formatWorkoutDuration,
} from "@fitme/i18n";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { Text } from "~/components/ui/text";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useI18n } from "~/lib/i18n";

interface WorkoutSessionHistoryRowProps {
  workoutSession: WorkoutSession;
}

/** A finished workout in History: name, when, totals and how long it took. */
export default function WorkoutSessionHistoryRow({
  workoutSession,
}: WorkoutSessionHistoryRowProps) {
  const { data: profile } = useProfileQuery();
  const i18n = useI18n();
  const { t } = useTranslation();
  const startedAt = new Date(workoutSession.started_at);
  // Skipped exercises (no set logged) aren't part of the session's history.
  const exercises = loggedExercises(workoutSession.exercises);
  const volume = sessionVolume(exercises);
  const totals = [
    formatCount(i18n, "exercises", exercises.length),
    formatCount(i18n, "sets", countLoggedSets(workoutSession)),
    volume > 0
      ? formatWeight(i18n, volume, profile?.measurement_system ?? "metric")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const duration = formatElapsed(
    new Date(workoutSession.finished_at).getTime() -
      new Date(workoutSession.started_at).getTime()
  );

  return (
    <View className="flex-row items-center gap-3 py-3.5 pr-3 pl-sm">
      <View className="flex-1 gap-0.5">
        <Text className="text-body-emphasized">
          {workoutSession.workout?.name ?? t("history.untitledWorkout")}
        </Text>
        <Text className="text-muted-foreground text-subhead">
          {`${formatDate(i18n, startedAt, "weekdayDayMonth")} · ${formatTime(i18n, startedAt)}`}
        </Text>
        <Text className="text-footnote text-muted-foreground">{totals}</Text>
      </View>
      <View
        accessibilityLabel={t("history.duration", {
          duration: formatWorkoutDuration(
            i18n,
            workoutSession.started_at,
            workoutSession.finished_at
          ),
        })}
        accessible
        className="rounded-lg border-continuous bg-foreground/10 px-2 py-0.5"
      >
        <Text className="text-mono-footnote-semibold">{duration}</Text>
      </View>
      <SymbolImage
        className="text-footnote-emphasized text-muted-foreground/60"
        name="chevron.right"
      />
    </View>
  );
}
