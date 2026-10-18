import {
  type Exercise,
  formatElapsed,
  formatRepRange,
  muscleGroupToName,
  type WorkoutSessionExerciseSet,
} from "@fitme/core";
import { Image } from "expo-image";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { Badge } from "~/components/ui/badge";
import { Text } from "~/components/ui/text";

/** Past this text scale the thumbnail goes above the text instead of beside it. */
const STACKED_FONT_SCALE = 1.4;

interface SessionExerciseHeaderProps {
  exercise: Exercise;
  /** Opens the guide; without one (nothing to show) the thumbnail isn't a button. */
  onOpenGuide?: () => void;
  sets: WorkoutSessionExerciseSet[];
}

/** What the plan asks for: `Target 4 × 12–15` and the rest between sets. */
function targetLines(sets: WorkoutSessionExerciseSet[]): string[] {
  const lines: string[] = [];
  const repRange = formatRepRange(sets);
  if (sets.length > 0 && repRange) {
    lines.push(`Target ${sets.length} × ${repRange}`);
  }
  const rest = sets.find((set) => set.rest_recommended)?.rest_recommended;
  if (rest) {
    lines.push(`Rest ${formatElapsed(rest * 1000)} between sets`);
  }
  return lines;
}

/**
 * The exercise's thumbnail (opening its guide, with the video), its muscle
 * groups and the plan's target, above the sets.
 */
export default function SessionExerciseHeader({
  exercise,
  onOpenGuide,
  sets,
}: SessionExerciseHeaderProps) {
  const lines = targetLines(sets);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACKED_FONT_SCALE;

  return (
    <View className={stacked ? "gap-3.5" : "flex-row items-center gap-3.5"}>
      <Pressable
        accessibilityHint="Opens the exercise guide"
        accessibilityLabel={`How to do ${exercise.name}`}
        accessibilityRole="button"
        className="active:opacity-80"
        disabled={!onOpenGuide}
        hitSlop={8}
        onPress={onOpenGuide}
      >
        <View className="h-21 w-28 items-center justify-center overflow-hidden rounded-2xl border-continuous bg-secondary">
          {exercise.thumbnail_url ? (
            <Image
              contentFit="cover"
              source={{ uri: exercise.thumbnail_url }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {onOpenGuide ? (
            <View className="size-10 items-center justify-center rounded-full bg-background/80">
              <SymbolImage
                className="text-foreground dark:text-foreground"
                name={exercise.video_url ? "play.fill" : "info"}
                size={16}
              />
            </View>
          ) : null}
        </View>
      </Pressable>
      <View className={stacked ? "gap-2" : "flex-1 gap-2"}>
        {exercise.muscle_groups.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5">
            {exercise.muscle_groups.map((muscleGroup) => (
              <Badge key={muscleGroup} variant="secondary">
                <Text>{muscleGroupToName(muscleGroup)}</Text>
              </Badge>
            ))}
          </View>
        )}
        {lines.length > 0 && (
          <Text className="text-muted-foreground text-subhead">
            {lines.join("\n")}
          </Text>
        )}
      </View>
    </View>
  );
}
