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
import { Card } from "~/components/ui/card";
import { Text } from "~/components/ui/text";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useNow } from "~/hooks/use-now";
import { cn } from "~/lib/utils";

interface WorkoutSessionStatsProps {
  workoutSession: WorkoutSession;
}

const SEGMENT_CLASS = {
  done: "bg-primary",
  "in-progress": "bg-primary/40",
  todo: "bg-foreground/10",
} as const;

/** Past this text scale the three stats don't fit side by side. */
const STACKED_FONT_SCALE = 1.4;

function Stat({
  label,
  stacked,
  unit,
  value,
}: {
  label: string;
  stacked: boolean;
  /** Set in the body font after the number, so the mono value stays tight. */
  unit?: string;
  value: string;
}) {
  return (
    <View accessible className={cn("gap-0.5", !stacked && "flex-1")}>
      <Text className="text-footnote text-muted-foreground">{label}</Text>
      <Text
        adjustsFontSizeToFit
        className="font-ibm-plex-mono-semibold text-title-3"
        numberOfLines={1}
      >
        {value}
        {unit ? (
          <Text className="font-nunito-sans-semibold text-subhead text-muted-foreground">
            {` ${unit}`}
          </Text>
        ) : null}
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
    <Card>
      <View className="gap-3.5 p-sm">
        <View className={stacked ? "gap-3" : "flex-row gap-2"}>
          <Stat
            label="Duration"
            stacked={stacked}
            value={formatElapsed(endedAt - startedAt)}
          />
          <Stat
            label="Volume"
            stacked={stacked}
            unit={weightLabel}
            value={volume.toLocaleString()}
          />
          <Stat
            label="Sets"
            stacked={stacked}
            value={`${countLoggedSets(workoutSession)}/${totalSets}`}
          />
        </View>
        {progress.length > 0 && (
          <View className="gap-2">
            <View
              accessibilityElementsHidden
              className="flex-row gap-1"
              importantForAccessibility="no-hide-descendants"
            >
              {progress.map(({ id, state }) => (
                <View
                  className={cn("h-1 flex-1 rounded-full", SEGMENT_CLASS[state])}
                  key={id}
                />
              ))}
            </View>
            <Text className="text-footnote text-muted-foreground">
              {doneCount} of {progress.length} exercises done
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}
