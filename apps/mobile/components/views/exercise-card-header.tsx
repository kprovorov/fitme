import { muscleGroupToName } from "@fitme/core";
import type { ReactNode } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { Text } from "~/components/ui/text";
import type { ShownExercise } from "~/hooks/queries/library";
import ExerciseImage from "../exercises/exercise-image";

/** Past this text scale the thumbnail goes above the name instead of beside it. */
const STACKED_FONT_SCALE = 1.4;

interface ExerciseCardHeaderProps {
  /** What a press on the Exercise opens; none leaves it disabled. */
  accessibilityHint: string;
  exercise: ShownExercise;
  onPress?: () => void;
  /** Beside the Exercise: the session's menu, or a chevron when it opens. */
  trailing: ReactNode;
}

/** The Exercise's thumbnail and name, opening its screen when it can. */
export default function ExerciseCardHeader({
  accessibilityHint,
  exercise,
  onPress,
  trailing,
}: ExerciseCardHeaderProps) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACKED_FONT_SCALE;

  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        accessibilityHint={onPress ? accessibilityHint : undefined}
        // Without a press it isn't a control: no dimmed button for VoiceOver.
        accessibilityRole={onPress ? "button" : undefined}
        className={
          stacked
            ? "flex-1 gap-sm active:opacity-80"
            : "flex-1 flex-row items-center gap-sm active:opacity-80"
        }
        disabled={!onPress}
        onPress={onPress}
      >
        <ExerciseImage exercise={exercise} radius={10} size={50} />
        <View className={stacked ? "gap-1" : "flex-1 gap-1"}>
          <Text className="text-body-emphasized">{exercise.name}</Text>
          {exercise.muscle_groups.length > 0 && (
            <Text className="text-footnote text-muted-foreground">
              {exercise.muscle_groups.map(muscleGroupToName).join(", ")}
            </Text>
          )}
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

/** Shown beside an Exercise that opens its screen. */
export function OpenChevron() {
  return (
    <SymbolImage
      className="text-footnote-emphasized text-muted-foreground/60"
      name="chevron.right"
    />
  );
}
