import {
  countLoggedSets,
  formatElapsed,
  getWeightLabel,
  loggedExercises,
  sessionVolume,
  type WorkoutSession,
} from "@fitme/core";
import { format } from "date-fns";
import { View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { Text } from "~/components/ui/text";
import { useProfileQuery } from "~/hooks/queries/profiles";

interface WorkoutSessionHistoryRowProps {
  workoutSession: WorkoutSession;
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/** A finished workout in History: name, when, totals and how long it took. */
export default function WorkoutSessionHistoryRow({
  workoutSession,
}: WorkoutSessionHistoryRowProps) {
  const { data: profile } = useProfileQuery();
  // Skipped exercises (no set logged) aren't part of the session's history.
  const exercises = loggedExercises(workoutSession.exercises);
  const volume = sessionVolume(exercises);
  const totals = [
    plural(exercises.length, "exercise"),
    plural(countLoggedSets(workoutSession), "set"),
    volume > 0
      ? `${volume.toLocaleString()} ${getWeightLabel(profile?.measurement_system ?? "metric")}`
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
        <Text className="font-nunito-sans-semibold text-body">
          {workoutSession.workout?.name ?? "Workout"}
        </Text>
        <Text className="text-muted-foreground text-subhead">
          {format(new Date(workoutSession.started_at), "EEE, MMM d · h:mm a")}
        </Text>
        <Text className="text-footnote text-muted-foreground">{totals}</Text>
      </View>
      <View
        accessibilityLabel={`Duration ${duration}`}
        accessible
        className="rounded-lg border-continuous bg-foreground/10 px-2 py-0.5"
      >
        <Text className="font-ibm-plex-mono-semibold text-footnote">
          {duration}
        </Text>
      </View>
      <SymbolImage
        className="text-muted-foreground/60"
        name="chevron.right"
        size={14}
      />
    </View>
  );
}
