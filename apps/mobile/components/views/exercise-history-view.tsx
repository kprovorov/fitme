import {
  bestSet,
  formatSetResult,
  getWeightLabel,
  type WorkoutSessionExercise,
  type WorkoutSessionExerciseSet,
} from "@fitme/core";
import { format } from "date-fns";
import { View } from "react-native";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { SET_TABLE_MAX_FONT_SCALE } from "../forms/workout-exercise-set-form";
import { Card, CardTitle } from "../ui/card";
import { Text } from "../ui/text";

interface ExerciseHistoryViewProps {
  /** The catalog exercise. */
  exerciseId: string;
  /** The session exercise being logged, left out of its own history. */
  excludeId?: string;
}

/** How many past sessions the card lists. */
const SHOWN_SESSIONS = 3;

const isLogged = (set: WorkoutSessionExerciseSet) => set.reps_completed !== null;

const hasLoggedSet = (entry: WorkoutSessionExercise) =>
  entry.sets.some(isLogged);

/**
 * A session's sets on one line: `17.5 kg · 15, 15, 12` when the weight never
 * changed, otherwise `15 × 15, 17.5 × 12`.
 */
function setsLine(
  sets: WorkoutSessionExerciseSet[],
  weightLabel: string
): string {
  const logged = sets.filter(isLogged).sort((a, b) => a.order - b.order);
  const weights = new Set(logged.map((set) => set.weight_completed ?? 0));
  const [weight] = weights;
  if (weights.size === 1 && weight) {
    const reps = logged.map((set) => set.reps_completed).join(", ");
    return `${weight} ${weightLabel} · ${reps}`;
  }
  return logged
    .map((set) =>
      formatSetResult({
        reps: set.reps_completed ?? 0,
        weight: set.weight_completed,
      })
    )
    .join(", ");
}

/** The exercise's last sessions, one line of sets each, and its best set. */
export default function ExerciseHistoryView({
  exerciseId,
  excludeId,
}: ExerciseHistoryViewProps) {
  const { data: items } = useExerciseHistoryQuery({
    variables: {
      exerciseId,
    },
  });
  const { data: profile } = useProfileQuery();
  const weightLabel = getWeightLabel(profile?.measurement_system ?? "metric");

  const entries = (items ?? []).filter(
    (item) => item.id !== excludeId && hasLoggedSet(item)
  );
  if (entries.length === 0) {
    return null;
  }
  const best = bestSet(entries.flatMap((entry) => entry.sets));

  return (
    <Card>
      <View className="gap-3 p-sm">
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-2">
          <CardTitle>History</CardTitle>
          {best ? (
            <Text className="text-footnote text-muted-foreground">
              Best {formatSetResult(best)}
            </Text>
          ) : null}
        </View>
        {entries.slice(0, SHOWN_SESSIONS).map((entry) => (
          <View className="flex-row items-baseline gap-3" key={entry.id}>
            <Text
              className="w-16 text-subhead"
              maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
            >
              {format(new Date(entry.created_at ?? ""), "MMM d")}
            </Text>
            <Text
              className="flex-1 text-subhead text-muted-foreground"
              maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
            >
              {setsLine(entry.sets, weightLabel)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
