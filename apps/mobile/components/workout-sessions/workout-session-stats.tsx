import {
  countLoggedSets,
  exerciseProgress,
  formatElapsed,
  getWeightLabel,
  sessionVolume,
  type WorkoutSession,
} from "@fitme/core";
import { useIsFocused } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { Text } from "~/components/ui/text";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useNow } from "~/hooks/use-now";
import { cn } from "~/lib/utils";

interface WorkoutSessionStatsProps {
  workoutSession: WorkoutSession;
}

/** Lime once an exercise is done, grey until then (started or not). */
const SEGMENT_CLASS = {
  done: "bg-primary",
  "in-progress": "bg-muted-foreground",
  todo: "bg-muted-foreground",
} as const;

/** Past this text scale the three stats don't fit side by side. */
const STACKED_FONT_SCALE = 1.4;

function Stat({
  label,
  stacked,
  value,
}: {
  label: string;
  stacked: boolean;
  value: string;
}) {
  return (
    <View accessible className={cn("gap-1", !stacked && "flex-1")}>
      <Text className="text-caption-1 text-muted-foreground">{label}</Text>
      <Text
        adjustsFontSizeToFit
        className="font-ibm-plex-mono-semibold text-body"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Duration (ticking while the session runs), volume and logged sets, then one
 * progress segment per exercise.
 */
export default function WorkoutSessionStats({
  workoutSession,
}: WorkoutSessionStatsProps) {
  const { data: profile } = useProfileQuery();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACKED_FONT_SCALE;
  const isFinished = !!workoutSession.finished_at;
  // Ticks only while the session screen is on top, not under an exercise.
  const isFocused = useIsFocused();
  const now = useNow(!isFinished && isFocused);

  const startedAt = new Date(workoutSession.started_at).getTime();
  const endedAt = isFinished
    ? new Date(workoutSession.finished_at).getTime()
    : now;
  const totalSets = workoutSession.exercises.reduce(
    (total, exercise) => total + exercise.sets.length,
    0
  );
  const volume = sessionVolume(workoutSession.exercises);
  const weightLabel = getWeightLabel(profile?.measurement_system ?? "metric");

  const progress = [...workoutSession.exercises]
    .sort((a, b) => a.order - b.order)
    .map((exercise) => ({
      id: exercise.id,
      state: exerciseProgress(exercise.sets).state,
    }));
  const doneCount = progress.filter(({ state }) => state === "done").length;

  return (
    <View className="gap-sm">
      <View className={stacked ? "gap-3" : "flex-row gap-2"}>
        <Stat
          label="Duration"
          stacked={stacked}
          value={formatElapsed(endedAt - startedAt)}
        />
        <Stat
          label="Volume"
          stacked={stacked}
          value={`${volume.toLocaleString()} ${weightLabel}`}
        />
        <Stat
          label="Sets"
          stacked={stacked}
          value={`${countLoggedSets(workoutSession)}/${totalSets}`}
        />
      </View>
      {progress.length > 0 && (
        <View className="gap-sm">
          <View
            accessibilityElementsHidden
            className="flex-row gap-2"
            importantForAccessibility="no-hide-descendants"
          >
            {progress.map(({ id, state }) => (
              <View
                className={cn("h-1 flex-1 rounded-full", SEGMENT_CLASS[state])}
                key={id}
              />
            ))}
          </View>
          <Text className="text-caption-1 text-muted-foreground">
            {doneCount} of {progress.length} exercises done
          </Text>
        </View>
      )}
    </View>
  );
}
