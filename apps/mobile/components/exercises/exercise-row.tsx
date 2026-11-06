import type { ExerciseSummary } from "@fitme/library-sdk";
import type React from "react";
import { useCallback } from "react";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import ExerciseImage from "~/components/exercises/exercise-image";
import { SymbolImage } from "~/components/symbol-image";
import { MenuListItem } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { useChoiceLabels } from "~/lib/choices";
import { cn } from "~/lib/utils";

/**
 * The accent symbol ending a row, saying what tapping it does: the chevron
 * opening the Exercise, the picker's "+" or swap.
 */
export const ExerciseRowSymbol = ({ name }: { name: SFSymbol }) => (
  <SymbolImage
    className="text-body-emphasized text-primary shrink-0"
    name={name}
  />
);

/** The accent chevron ending a row that opens the Exercise. */
export const ExerciseRowChevron = () => (
  <ExerciseRowSymbol name="chevron.right" />
);

/**
 * The line between two rows, inset like a `MenuList`'s, on the rows' card
 * surface, carrying the group's side stroke through.
 */
export const ExerciseRowSeparator = () => (
  <View className="border-border bg-card border-x">
    <Separator className="mx-sm w-auto" />
  </View>
);

interface ExerciseRowProps {
  // What VoiceOver reads for the row instead of its text ("Add Bench Press").
  accessibilityLabel?: string;
  exercise: ExerciseSummary;
  isFirst: boolean;
  isLast: boolean;
  onExercisePress: (exercise: ExerciseSummary) => void;
  // What ends the row: the Library's chevron, the picker's "+" or swap.
  trailing?: React.ReactNode;
}

/**
 * One Exercise of an inset grouped list (thumbnail, name and Muscle groups),
 * drawn on its own so a virtualised list can render it. The rows together
 * draw a `Card`: its fill and its `border` stroke, the first row rounding the
 * group's top corners and the last its bottom ones.
 */
export const ExerciseRow = ({
  accessibilityLabel,
  exercise,
  isFirst,
  isLast,
  onExercisePress,
  trailing,
}: ExerciseRowProps) => {
  const labels = useChoiceLabels();

  // The press never waits on what picking does (the picker's save).
  const handlePress = useCallback(() => {
    onExercisePress(exercise);
  }, [exercise, onExercisePress]);

  return (
    <View
      className={cn(
        "border-border border-continuous bg-card overflow-hidden border-x",
        isFirst && "rounded-t-card border-t",
        isLast && "rounded-b-card border-b"
      )}
    >
      <MenuListItem
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
      >
        <ExerciseImage exercise={exercise} radius={8} size={50} />
        <View className="flex-1">
          <Text variant="large">{exercise.name}</Text>
          {exercise.muscle_groups.length > 0 && (
            <Text variant="muted">
              {exercise.muscle_groups.map(labels.muscleGroup).join(", ")}
            </Text>
          )}
        </View>
        {trailing}
      </MenuListItem>
    </View>
  );
};
